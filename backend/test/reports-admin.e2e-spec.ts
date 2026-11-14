/**
 * Steps 9–10 e2e: reports (JSON + PDF), admin stats, audit-log API and hardening headers.
 * Runs on the TEST database; Puppeteer renders real PDFs.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/common/utils/password';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import { Wing } from '../src/modules/wings/entities/wing.entity';

const API = '/api/v1';
const PASSWORD = 'E2ePass1234';
const ZONE = 'Asia/Dhaka';

/** Collects a binary body (supertest would otherwise try to parse it). */
function binary(
  res: request.Response,
  cb: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

describe('Reports, admin stats, audit log, hardening (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const tokens: Record<'officer' | 'colleague' | 'admin', string> = {} as never;
  const ids: Record<'officer' | 'colleague' | 'admin', string> = {} as never;
  // A day 20 days ahead (Dhaka), so meetings are in the future.
  const day = DateTime.now().setZone(ZONE).startOf('day').plus({ days: 20 });
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return day
      .set({ hour: h, minute: m })
      .toISO({ suppressMilliseconds: true })!;
  };
  const dateParam = day.toFormat('yyyy-MM-dd');

  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof tokens) => ({
    Authorization: `Bearer ${tokens[who]}`,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    expect(ds.options.database).toMatch(/_test$/);

    const designationId = (
      await ds.getRepository(Designation).insert({
        nameBn: 'রিপোর্ট পদবি',
        nameEn: 'E2ER Designation',
        priority: 5,
      })
    ).identifiers[0].id as string;
    const wingId = (
      await ds
        .getRepository(Wing)
        .insert({ nameBn: 'রিপোর্ট উইং', nameEn: 'E2ER Wing' })
    ).identifiers[0].id as string;
    const passwordHash = await hashPassword(PASSWORD);
    for (const [who, role] of [
      ['officer', UserRole.OFFICER],
      ['colleague', UserRole.OFFICER],
      ['admin', UserRole.ADMIN],
    ] as const) {
      ids[who] = (
        await ds.getRepository(User).insert({
          loginEmail: `${who}@e2e-reports.test`,
          notificationEmail: `${who}@e2e-reports.test`,
          passwordHash,
          nameBn: `রিপোর্ট ${who}`,
          nameEn: `E2ER ${who}`,
          designationId,
          wingId,
          role,
          mustChangePassword: false,
        })
      ).identifiers[0].id as string;
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ loginEmail: `${who}@e2e-reports.test`, password: PASSWORD });
      tokens[who] = (res.body as { accessToken: string }).accessToken;
    }

    // officer organizes 2 (one cancelled), attends 1 organized by colleague
    const make = (
      who: keyof typeof tokens,
      start: string,
      end: string,
      title: string,
      participants: string[] = [],
    ) =>
      http()
        .post(`${API}/meetings`)
        .set(as(who))
        .send({
          title,
          startAt: at(start),
          endAt: at(end),
          participantIds: participants,
        })
        .expect(201);
    await make('officer', '09:00', '10:30', '<b>রিপোর্ট</b> সভা এক');
    const cancelled = await make('officer', '11:00', '12:00', 'বাতিল হবে');
    await http()
      .post(`${API}/meetings/${(cancelled.body as { id: string }).id}/cancel`)
      .set(as('officer'))
      .send({ reason: 'পরীক্ষা' })
      .expect(200);
    await make('colleague', '14:00', '15:00', 'সহকর্মীর সভা', [ids.officer]);
  });

  afterAll(async () => {
    await app.close(); // also closes the PDF browser
  });

  // ---------------------------------------------------------------- reports

  describe('reports', () => {
    it('GET /reports/me: summary math and paginated list', async () => {
      const res = await http()
        .get(`${API}/reports/me`)
        .query({ period: 'day', date: dateParam, limit: 2 })
        .set(as('officer'))
        .expect(200);
      expect(res.body).toMatchObject({
        period: { period: 'day', date: dateParam },
        officer: { id: ids.officer, designationBn: 'রিপোর্ট পদবি' },
        summary: {
          totalMeetings: 3,
          organized: 2,
          attended: 1,
          byStatus: { SCHEDULED: 2, COMPLETED: 0, CANCELLED: 1 },
          totalHours: 2.5, // 1.5 + 1.0; the cancelled hour is not counted
          byDay: [{ date: dateParam, meetings: 3, hours: 2.5 }],
        },
        meetings: { total: 3, page: 1, limit: 2, totalPages: 2 },
      });
      const items = (
        res.body as { meetings: { items: Array<{ myRole: string }> } }
      ).meetings.items;
      expect(items.map((i) => i.myRole)).toEqual(['ORGANIZER', 'ORGANIZER']);
    });

    it('rejects bad period/date with 400', async () => {
      await http()
        .get(`${API}/reports/me`)
        .query({ period: 'decade' })
        .set(as('officer'))
        .expect(400);
      await http()
        .get(`${API}/reports/me`)
        .query({ date: '2026-02-30' })
        .set(as('officer'))
        .expect(400);
    });

    it('GET /reports/me/pdf returns a real PDF attachment with a safe file name', async () => {
      const res = await http()
        .get(`${API}/reports/me/pdf`)
        .query({ period: 'day', date: dateParam })
        .set(as('officer'))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="meeting-report-${dateParam}.pdf"`,
      );
      const pdf = res.body as Buffer;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(5000);
      // Embedded fonts (owner decisions 2026-11-14): Nikosh for Bangla, Tinos for English.
      expect(pdf.includes('Nikosh')).toBe(true);
      expect(pdf.includes('Tinos')).toBe(true);
      expect(pdf.includes('NotoSansBengali')).toBe(false);
    }, 60_000);

    it('office reports are ADMIN only (403 for an officer, JSON and PDF)', async () => {
      await http().get(`${API}/reports/office`).set(as('officer')).expect(403);
      await http()
        .get(`${API}/reports/office/pdf`)
        .set(as('officer'))
        .expect(403);
    });

    it('GET /reports/office: totals, groups, top organizers; PDF works', async () => {
      const res = await http()
        .get(`${API}/reports/office`)
        .query({ period: 'day', date: dateParam })
        .set(as('admin'))
        .expect(200);
      expect(res.body).toMatchObject({
        summary: {
          totalMeetings: 3,
          totalHours: 2.5,
          conflicts: { pending: 0, resolved: 0 },
          byWing: [{ nameBn: 'রিপোর্ট উইং', meetings: 3 }],
          byDesignation: [{ nameBn: 'রিপোর্ট পদবি', priority: 5, meetings: 3 }],
        },
      });
      const top = (
        res.body as {
          summary: {
            topOrganizers: Array<{ userId: string; meetings: number }>;
          };
        }
      ).summary.topOrganizers;
      expect(top[0]).toMatchObject({ userId: ids.officer, meetings: 2 });

      const pdf = await http()
        .get(`${API}/reports/office/pdf`)
        .query({ period: 'month', date: dateParam })
        .set(as('admin'))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      expect(pdf.headers['content-disposition']).toMatch(
        /^attachment; filename="office-meeting-report-\d{4}-\d{2}\.pdf"$/,
      );
    }, 60_000);
  });

  // ---------------------------------------------------------------- admin API

  describe('admin stats and audit log', () => {
    it('GET /admin/stats (ADMIN only)', async () => {
      await http().get(`${API}/admin/stats`).set(as('officer')).expect(403);
      const res = await http()
        .get(`${API}/admin/stats`)
        .set(as('admin'))
        .expect(200);
      const body = res.body as {
        users: {
          total: number;
          active: number;
          inactive: number;
          admins: number;
        };
        meetings: { today: number; thisWeek: number };
        pendingConflicts: number;
        pendingChangeRequests: number;
        failedMails: number;
      };
      expect(body.users.total).toBe(body.users.active + body.users.inactive);
      expect(body.users.admins).toBeGreaterThanOrEqual(1);
      for (const n of [
        body.meetings.today,
        body.meetings.thisWeek,
        body.pendingConflicts,
        body.pendingChangeRequests,
        body.failedMails,
      ]) {
        expect(Number.isInteger(n)).toBe(true);
      }
    });

    it('GET /audit-logs filters, newest first, and redacts secrets and phone numbers', async () => {
      await ds.getRepository(AuditLog).save(
        Object.assign(new AuditLog(), {
          actorId: ids.admin,
          action: AuditAction.USER_UPDATE,
          entityType: 'user',
          entityId: ids.officer,
          before: { mobile: '01712345678', passwordHash: '$argon2id$secret' },
          after: {
            mobile: '01812345678',
            note: 'নতুন নম্বর 01912345678',
            token: 'abc',
          },
        }),
      );
      await http().get(`${API}/audit-logs`).set(as('officer')).expect(403);
      const res = await http()
        .get(`${API}/audit-logs`)
        .query({ action: 'USER_UPDATE', entityId: ids.officer })
        .set(as('admin'))
        .expect(200);
      const [item] = (res.body as { items: Array<Record<string, unknown>> })
        .items;
      expect(item).toMatchObject({
        action: 'USER_UPDATE',
        actor: { id: ids.admin },
        before: { mobile: '***678', passwordHash: '[REDACTED]' },
        after: {
          mobile: '***678',
          note: 'নতুন নম্বর ***678',
          token: '[REDACTED]',
        },
      });
      expect(JSON.stringify(res.body)).not.toMatch(
        /01712345678|argon2id|"abc"/,
      );

      const meetings = await http()
        .get(`${API}/audit-logs`)
        .query({ action: 'MEETING_CREATE', actorId: ids.officer })
        .set(as('admin'))
        .expect(200);
      const list = meetings.body as {
        items: Array<{ createdAt: string }>;
        total: number;
      };
      expect(list.total).toBe(2);
      expect(
        new Date(list.items[0].createdAt) >= new Date(list.items[1].createdAt),
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------- hardening

  describe('hardening', () => {
    it('every response has X-Request-Id; error bodies include it; a valid client id is kept', async () => {
      const res = await http()
        .get(`${API}/nope`)
        .set('X-Request-Id', 'client-req-12345')
        .expect(404);
      expect(res.headers['x-request-id']).toBe('client-req-12345');
      expect(res.body).toMatchObject({
        statusCode: 404,
        requestId: 'client-req-12345',
      });
      const fresh = await http().get(`${API}/health`);
      expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      const unsafe = await http()
        .get(`${API}/health`)
        .set('X-Request-Id', 'bad\tid');
      expect(unsafe.headers['x-request-id']).not.toContain('bad');
    });

    it('security headers: CSP, no HSTS outside production, nosniff, frame-ancestors none', async () => {
      const res = await http().get(`${API}/health`);
      expect(res.headers['content-security-policy']).toContain(
        "default-src 'self'",
      );
      expect(res.headers['content-security-policy']).toContain(
        "frame-ancestors 'none'",
      );
      expect(res.headers['strict-transport-security']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
