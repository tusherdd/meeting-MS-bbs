/**
 * Release v1.13 e2e on the TEST database:
 * - the uploaded meeting notice "সভার নোটিশ" (SPEC.md §6.8): only the organizer uploads, replaces
 *   and removes (chair, member and admin 403); the meeting's people and admins download (others
 *   403), also after a cancel; PDF may open inline, DOCX is always an attachment; audited; private
 *   storage in DECISION_UPLOAD_DIR/notices/<meetingId>/;
 * - the lead rule for the internal chair (§6.4): a chair who organizes or chairs another
 *   overlapping SCHEDULED meeting blocks create and an edit that changes only the chair; being
 *   only a member elsewhere still just warns.
 * Own users, designations and days (100+), so it never touches the other e2e files.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/common/utils/password';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum';
import { DecisionStorageService } from '../src/modules/decisions/decision-storage.service';
import { docm, docx } from '../src/modules/decisions/docx.fixture-spec';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { MeetingNoticeFile } from '../src/modules/notices/entities/meeting-notice-file.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';

const API = '/api/v1';
const PASSWORD = 'E2ePass1234';
const ZONE = 'Asia/Dhaka';
const DOMAIN = 'e2e-v113.test';
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
  'latin1',
);
const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** org organizes; chair chairs; member attends; busy leads other meetings; stranger; admin. */
type Who = 'org' | 'chair' | 'member' | 'busy' | 'stranger' | 'admin';

interface Detail {
  id: string;
  hasNotice: boolean;
  notice: {
    originalName: string;
    mime: string;
    size: number;
    canManage: boolean;
  } | null;
}

interface Blocked {
  message: string;
  code: string;
  blocking: Array<{ meetingId: string; blockedBy: string[] }>;
}

function slot(offset: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return DateTime.now()
    .setZone(ZONE)
    .startOf('day')
    .plus({ days: offset })
    .set({ hour: h, minute: m })
    .toISO({ suppressMilliseconds: true })!;
}

describe('v1.13: meeting notice upload and the chair lead rule (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  let storageRoot: string;
  const ids = {} as Record<Who, string>;
  const tokens = {} as Record<Who, string>;

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const notice = (id: string) => `${API}/meetings/${id}/notice`;
  const upload = (
    who: Who,
    id: string,
    name: string,
    bytes: Buffer,
    type = 'application/pdf',
  ) =>
    http()
      .post(notice(id))
      .set(as(who))
      .attach('file', bytes, { filename: name, contentType: type });
  const binary = (req: request.Test) =>
    req.buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
  const download = (who: Who, id: string, inline = false) =>
    binary(
      http()
        .get(`${notice(id)}${inline ? '?inline=true' : ''}`)
        .set(as(who)),
    );
  const detail = async (who: Who, id: string) =>
    (await http().get(`${API}/meetings/${id}`).set(as(who)).expect(200))
      .body as Detail;
  const audits = (action: AuditAction, entityId: string) =>
    ds.getRepository(AuditLog).findBy({ action, entityId });
  const create = (who: Who, payload: Record<string, unknown>) =>
    http().post(`${API}/meetings`).set(as(who)).send(payload);

  /** org organizes, chair chairs, member attends. */
  async function meeting(offset: number, title: string): Promise<string> {
    const res = await create('org', {
      title,
      startAt: slot(offset, '10:00'),
      endAt: slot(offset, '11:00'),
      room: 'সম্মেলন কক্ষ',
      chairId: ids.chair,
      participantIds: [ids.member],
    }).expect(201);
    return (res.body as { id: string }).id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    expect(ds.options.database).toMatch(/_test$/);
    storageRoot = app.get(DecisionStorageService).root;

    const designation = async (nameEn: string, priority: number) =>
      (
        await ds
          .getRepository(Designation)
          .insert({ nameBn: `পদবি ${nameEn}`, nameEn, priority })
      ).identifiers[0].id as string;
    const director = await designation('V113 Director', 4);
    const officer = await designation('V113 Officer', 7);
    const passwordHash = await hashPassword(PASSWORD);
    const people: Array<[Who, string, UserRole]> = [
      ['org', officer, UserRole.OFFICER],
      ['chair', director, UserRole.OFFICER],
      ['member', officer, UserRole.OFFICER],
      ['busy', director, UserRole.OFFICER],
      ['stranger', officer, UserRole.OFFICER],
      ['admin', officer, UserRole.ADMIN],
    ];
    for (const [who, designationId, role] of people) {
      ids[who] = (
        await ds.getRepository(User).insert({
          loginEmail: `${who}@${DOMAIN}`,
          notificationEmail: `${who}@${DOMAIN}`,
          passwordHash,
          nameBn: `কর্মকর্তা ${who}`,
          nameEn: `V113 ${who}`,
          designationId,
          role,
          mustChangePassword: false,
        })
      ).identifiers[0].id as string;
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ loginEmail: `${who}@${DOMAIN}`, password: PASSWORD });
      tokens[who] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('notice: upload, replace, remove, download permissions', () => {
    let id: string;
    let firstStored: string;

    beforeAll(async () => {
      id = await meeting(100, 'নোটিশ পরীক্ষা সভা');
    });

    it('no notice yet: hasNotice false, download 404', async () => {
      const d = await detail('member', id);
      expect(d.hasNotice).toBe(false);
      expect(d.notice).toBeNull();
      await download('member', id).expect(404);
    });

    it.each(['chair', 'member', 'admin', 'stranger'] as const)(
      '%s cannot upload (403)',
      async (who) => {
        await upload(who, id, 'n.pdf', PDF).expect(403);
      },
    );

    it('the organizer uploads a PDF: 201, stored privately, audited as UPLOADED', async () => {
      const res = await upload('org', id, 'সভার নোটিশ.pdf', PDF).expect(201);
      expect(res.body).toMatchObject({
        originalName: 'সভার নোটিশ.pdf',
        mime: 'application/pdf',
        size: PDF.length,
        canManage: true,
      });
      const row = await ds
        .getRepository(MeetingNoticeFile)
        .findOneByOrFail({ meetingId: id });
      firstStored = row.storedName;
      expect(firstStored).toMatch(/^[0-9a-f-]{36}\.pdf$/);
      expect(existsSync(join(storageRoot, 'notices', id, firstStored))).toBe(
        true,
      );
      const [entry] = await audits(AuditAction.MEETING_NOTICE_UPLOADED, id);
      expect(entry.actorId).toBe(ids.org);
    });

    it('hasNotice in the detail and the list; canManage only for the organizer', async () => {
      expect((await detail('org', id)).notice?.canManage).toBe(true);
      const forChair = await detail('chair', id);
      expect(forChair.hasNotice).toBe(true);
      expect(forChair.notice?.canManage).toBe(false);
      const list = await http()
        .get(`${API}/meetings`)
        .query({ from: slot(100, '00:00'), to: slot(101, '00:00') })
        .set(as('member'))
        .expect(200);
      const items = (
        list.body as { items: Array<{ id: string; hasNotice: boolean }> }
      ).items;
      expect(items.find((m) => m.id === id)?.hasNotice).toBe(true);
      // v1.17: the row menu label depends on the type.
      expect(
        (items as Array<{ id: string; noticeMime?: string | null }>).find(
          (m) => m.id === id,
        )?.noticeMime,
      ).toBe('application/pdf');
    });

    it('a member downloads it: same bytes, a PDF always inline (v1.17), nosniff, no-store', async () => {
      const res = await download('member', id, true).expect(200);
      expect((res.body as Buffer).equals(PDF)).toBe(true);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/^inline;/);
      expect(res.headers['content-disposition']).toContain("filename*=UTF-8''");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cache-control']).toBe('private, no-store');
      // v1.17: inline without ?inline too (the file viewer panel fetches the plain URL).
      const plain = await download('member', id).expect(200);
      expect(plain.headers['content-disposition']).toMatch(/^inline;/);
    });

    it('an admin may download; a stranger may not (403)', async () => {
      await download('admin', id).expect(200);
      await download('stranger', id).expect(403);
    });

    it('the organizer replaces it with a DOCX: old bytes gone, audited as REPLACED, DOCX always an attachment', async () => {
      const bytes = docx();
      await upload('org', id, 'notice.docx', bytes, DOCX_TYPE).expect(201);
      expect(existsSync(join(storageRoot, 'notices', id, firstStored))).toBe(
        false,
      );
      expect(
        await ds.getRepository(MeetingNoticeFile).countBy({ meetingId: id }),
      ).toBe(1);
      const [entry] = await audits(AuditAction.MEETING_NOTICE_REPLACED, id);
      expect(entry.actorId).toBe(ids.org);
      const res = await download('member', id, true).expect(200);
      expect(res.headers['content-type']).toBe(DOCX_TYPE);
      expect(res.headers['content-disposition']).toMatch(/^attachment;/);
      const plainDocx = await download('member', id).expect(200);
      expect(plainDocx.headers['content-disposition']).toMatch(/^attachment;/);
      expect((res.body as Buffer).equals(bytes)).toBe(true);
    });

    it('a macro-enabled Word file is refused (400)', async () => {
      const res = await upload('org', id, 'n.docm', docm(), DOCX_TYPE).expect(
        400,
      );
      expect((res.body as { code: string }).code).toBe('DECISION_FILE_MACRO');
    });

    it('the chair cannot remove it (403); the organizer can (204, audited); then 404', async () => {
      await http().delete(notice(id)).set(as('chair')).expect(403);
      await http().delete(notice(id)).set(as('admin')).expect(403);
      await http().delete(notice(id)).set(as('org')).expect(204);
      const [entry] = await audits(AuditAction.MEETING_NOTICE_REMOVED, id);
      expect(entry.actorId).toBe(ids.org);
      await download('member', id).expect(404);
      await http().delete(notice(id)).set(as('org')).expect(404);
    });

    it('the chair is refused with the message in the request language', async () => {
      const res = await upload('chair', id, 'n.pdf', PDF)
        .set('Accept-Language', 'en')
        .expect(403);
      expect(res.body).toMatchObject({
        code: 'NOTICE_CHANGE_FORBIDDEN',
        message:
          'Only the organizer of the meeting can upload, replace or remove its notice.',
      });
    });
  });

  describe('notice on a cancelled meeting', () => {
    it('no upload / remove after the cancel, but the file can still be downloaded', async () => {
      const id = await meeting(101, 'বাতিল নোটিশ সভা');
      await upload('org', id, 'n.pdf', PDF).expect(201);
      await http()
        .post(`${API}/meetings/${id}/cancel`)
        .set(as('org'))
        .send({ reason: 'পরীক্ষা' })
        .expect(200);
      await upload('org', id, 'n2.pdf', PDF).expect(409);
      await http().delete(notice(id)).set(as('org')).expect(409);
      const res = await download('member', id).expect(200);
      expect((res.body as Buffer).equals(PDF)).toBe(true);
    });
  });

  describe('lead rule for the internal chair (SPEC.md §6.4, v1.13)', () => {
    it('a chair who ORGANIZES another overlapping meeting blocks the create (409, chair message)', async () => {
      const own = await create('busy', {
        title: 'ব্যস্ত কর্মকর্তার সভা',
        startAt: slot(104, '10:00'),
        endAt: slot(104, '11:00'),
        room: 'কক্ষ ১',
      }).expect(201);
      const res = await create('org', {
        title: 'সভাপতি ব্যস্ত',
        startAt: slot(104, '10:30'),
        endAt: slot(104, '11:30'),
        room: 'কক্ষ ২',
        chairId: ids.busy,
      }).expect(409);
      const body = res.body as Blocked;
      expect(body.message).toBe(
        'সভাপতি একই সময়ে আরেকটি সভার আয়োজক বা সভাপতি।',
      );
      expect(body.code).toBe('TIME_CONFLICT_CHAIR_BLOCKING');
      expect(body.blocking).toEqual([
        expect.objectContaining({
          meetingId: (own.body as { id: string }).id,
          blockedBy: ['CHAIR'],
        }),
      ]);
      const en = await create('org', {
        title: 'সভাপতি ব্যস্ত',
        startAt: slot(104, '10:30'),
        endAt: slot(104, '11:30'),
        room: 'কক্ষ ২',
        chairId: ids.busy,
      })
        .set('Accept-Language', 'en')
        .expect(409);
      expect((en.body as Blocked).message).toBe(
        'The chair is already the organizer or chair of another meeting at this time.',
      );
    });

    it('changing ONLY the chair is blocked when the new chair leads another overlapping meeting', async () => {
      // C: org organizes, chair chairs, busy is a member.
      const c = await create('org', {
        title: 'সভাপতি বদল সভা',
        startAt: slot(105, '10:00'),
        endAt: slot(105, '11:00'),
        room: 'কক্ষ ৩',
        chairId: ids.chair,
        participantIds: [ids.busy],
      }).expect(201);
      const cId = (c.body as { id: string }).id;
      // D: busy organizes an overlapping meeting → busy is only a MEMBER of C: a warning, saved.
      await create('busy', {
        title: 'ব্যস্ত কর্মকর্তার দ্বিতীয় সভা',
        startAt: slot(105, '10:30'),
        endAt: slot(105, '11:30'),
        room: 'কক্ষ ৪',
      }).expect(201);
      // The dry run already says no …
      const check = await http()
        .post(`${API}/meetings/check-conflicts`)
        .set(as('org'))
        .send({
          title: 'সভাপতি বদল সভা',
          meetingId: cId,
          startAt: slot(105, '10:00'),
          endAt: slot(105, '11:00'),
          chairId: ids.busy,
          participantIds: [ids.busy, ids.chair],
        })
        .expect(200);
      expect((check.body as { allowed: boolean }).allowed).toBe(false);
      // … and the edit that changes only the chair is refused; nothing changes.
      const res = await http()
        .patch(`${API}/meetings/${cId}`)
        .set(as('org'))
        .send({ chairId: ids.busy, participantIds: [ids.busy, ids.chair] })
        .expect(409);
      expect((res.body as Blocked).code).toBe('TIME_CONFLICT_CHAIR_BLOCKING');
      const after = await http()
        .get(`${API}/meetings/${cId}`)
        .set(as('org'))
        .expect(200);
      expect((after.body as { chair: { id: string } }).chair.id).toBe(
        ids.chair,
      );
    });

    it('a chair who CHAIRS another overlapping meeting is blocked too', async () => {
      await create('stranger', {
        title: 'অন্য আয়োজকের সভা',
        startAt: slot(106, '10:00'),
        endAt: slot(106, '11:00'),
        room: 'কক্ষ ৫',
        chairId: ids.busy,
      }).expect(201);
      const res = await create('org', {
        title: 'আবার সভাপতি',
        startAt: slot(106, '10:15'),
        endAt: slot(106, '10:45'),
        room: 'কক্ষ ৬',
        chairId: ids.busy,
      }).expect(409);
      expect((res.body as Blocked).blocking[0].blockedBy).toEqual(['CHAIR']);
    });
  });
});
