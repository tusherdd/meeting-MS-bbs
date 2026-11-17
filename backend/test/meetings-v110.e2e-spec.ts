/**
 * Release v1.10 e2e (SPEC.md §6.3, §6.8) on the TEST database:
 * - the internal chair may edit and cancel a meeting like the organizer (server-side check,
 *   audit with the real actor, the usual notices); a plain member may not; complete stays
 *   organizer/admin only;
 * - GET /meetings/:id/notice.pdf returns a PDF for the meeting's people and admins, 403 for
 *   others, 409 for cancelled meetings, and is audited;
 * - follow-up from v1.9: completing a meeting stored without a venue works.
 * Own users, designations, wing and days (80+), so it never touches the other e2e files.
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
import { Meeting } from '../src/modules/meetings/entities/meeting.entity';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { NotificationType } from '../src/modules/notifications/enums/notification-type.enum';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import { Wing } from '../src/modules/wings/entities/wing.entity';

const API = '/api/v1';
const PASSWORD = 'E2ePass1234';
const ZONE = 'Asia/Dhaka';
const DOMAIN = 'e2e-v110.test';

/** org: organizer; chair: internal chair; member: plain participant; stranger: not invited; admin. */
type Who = 'org' | 'chair' | 'member' | 'stranger' | 'admin';

function day(offset: number): DateTime {
  return DateTime.now().setZone(ZONE).startOf('day').plus({ days: offset });
}

function slot(offset: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return day(offset)
    .set({ hour: h, minute: m })
    .toISO({ suppressMilliseconds: true })!;
}

interface Detail {
  id: string;
  title: string;
  status: string;
  room: string | null;
}

describe('v1.10: chair may edit/cancel, meeting notice PDF (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const ids = {} as Record<Who, string>;
  const tokens = {} as Record<Who, string>;

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const create = (who: Who, payload: Record<string, unknown>) =>
    http().post(`${API}/meetings`).set(as(who)).send(payload);
  const patch = (who: Who, id: string, payload: Record<string, unknown>) =>
    http().patch(`${API}/meetings/${id}`).set(as(who)).send(payload);
  const cancel = (who: Who, id: string) =>
    http()
      .post(`${API}/meetings/${id}/cancel`)
      .set(as(who))
      .send({ reason: 'সভাপতির সিদ্ধান্তে বাতিল' });
  const notice = (who: Who, id: string) =>
    http()
      .get(`${API}/meetings/${id}/notice.pdf`)
      .set(as(who))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
  const audits = (action: AuditAction, entityId: string) =>
    ds.getRepository(AuditLog).find({ where: { action, entityId } });
  const notices = (who: Who, type: NotificationType) =>
    ds.getRepository(Notification).find({
      where: { userId: ids[who], type },
    });
  const meetingFor = async (offset: number, title: string) => {
    const res = await create('org', {
      title,
      agenda: 'ক) প্রথম বিষয়\nখ) বিবিধ',
      startAt: slot(offset, '11:00'),
      endAt: slot(offset, '12:00'),
      room: 'সম্মেলন কক্ষ',
      chairId: ids.chair,
      participantIds: [ids.member],
      guests: [
        {
          name: 'Guest Officer',
          designation: 'Consultant',
          email: `guest@${DOMAIN}`,
        },
      ],
    }).expect(201);
    return (res.body as Detail).id;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    expect(ds.options.database).toMatch(/_test$/);

    const designation = async (nameEn: string, priority: number) =>
      (
        await ds
          .getRepository(Designation)
          .insert({ nameBn: `পদবি ${nameEn}`, nameEn, priority })
      ).identifiers[0].id as string;
    const director = await designation('V110 Director', 4);
    const deputy = await designation('V110 Deputy Director', 6);
    const officer = await designation('V110 Statistical Officer', 7);
    const wingId = (
      await ds
        .getRepository(Wing)
        .insert({ nameBn: 'কম্পিউটার উইং (v1.10)', nameEn: 'V110 Wing' })
    ).identifiers[0].id as string;

    const passwordHash = await hashPassword(PASSWORD);
    const people: Array<[Who, string, UserRole]> = [
      ['org', deputy, UserRole.OFFICER],
      ['chair', director, UserRole.OFFICER],
      ['member', officer, UserRole.OFFICER],
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
          nameEn: `V110 ${who}`,
          designationId,
          wingId,
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

  describe('the internal chair may edit and cancel', () => {
    let id: string;

    beforeAll(async () => {
      id = await meetingFor(80, 'সভাপতির সম্পাদনা সভা');
    });

    it('a plain member cannot edit or cancel (403)', async () => {
      const edit = await patch('member', id, {
        title: 'সদস্যের চেষ্টা',
      }).expect(403);
      expect((edit.body as { code: string }).code).toBe(
        'NOT_ORGANIZER_OR_CHAIR',
      );
      await cancel('member', id).expect(403);
    });

    it('the chair edits: saved, audited with the chair as actor, organizer notified', async () => {
      const res = await patch('chair', id, {
        title: 'সভাপতির সম্পাদিত শিরোনাম',
        startAt: slot(80, '14:00'),
        endAt: slot(80, '15:00'),
      }).expect(200);
      expect((res.body as Detail).title).toBe('সভাপতির সম্পাদিত শিরোনাম');
      const [entry] = await audits(AuditAction.MEETING_UPDATE, id);
      expect(entry.actorId).toBe(ids.chair);
      expect(
        await notices('org', NotificationType.MEETING_UPDATED),
      ).not.toHaveLength(0);
      // The chair's priority snapshot stays (the chair did not change).
      const stored = await ds.getRepository(Meeting).findOneByOrFail({ id });
      expect(stored.priority).toBe(4);
    });

    it('the chair cannot mark it completed (organizer/admin only)', async () => {
      await http()
        .post(`${API}/meetings/${id}/complete`)
        .set(as('chair'))
        .send({})
        .expect(403);
    });

    it('the chair cancels: audited with the chair as actor, organizer notified', async () => {
      const res = await cancel('chair', id).expect(200);
      expect((res.body as Detail).status).toBe('CANCELLED');
      const [entry] = await audits(AuditAction.MEETING_CANCEL, id);
      expect(entry.actorId).toBe(ids.chair);
      expect(
        await notices('org', NotificationType.MEETING_CANCELLED),
      ).not.toHaveLength(0);
    });
  });

  describe('GET /meetings/:id/notice.pdf', () => {
    let id: string;

    beforeAll(async () => {
      id = await meetingFor(81, 'নোটিশ পরীক্ষা সভা');
    });

    it('returns a PDF for a participant, with an ASCII file name, and audits it', async () => {
      const res = await notice('member', id).expect(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="meeting-notice-${day(81).toISODate()}-${id.slice(0, 8)}.pdf"`,
      );
      const body = res.body as Buffer;
      expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      const [entry] = await audits(AuditAction.MEETING_NOTICE_EXPORTED, id);
      expect(entry.actorId).toBe(ids.member);
    });

    it('an admin who is not a participant may export it', async () => {
      await notice('admin', id).expect(200);
    });

    it('a non-participant officer gets 403', async () => {
      await notice('stranger', id).expect(403);
    });

    it('a cancelled meeting is rejected (409)', async () => {
      await cancel('org', id).expect(200);
      await notice('member', id).expect(409);
    });
  });

  describe('v1.9 follow-up', () => {
    it('completing a meeting stored without a venue works', async () => {
      const created = await create('org', {
        title: 'স্থান ছাড়া সম্পন্ন',
        startAt: slot(82, '10:00'),
        endAt: slot(82, '11:00'),
        room: 'কক্ষ ১০১',
      }).expect(201);
      const id = (created.body as Detail).id;
      // Simulate a meeting created before v1.9 that has already started.
      const start = DateTime.now().minus({ hours: 2 }).toJSDate();
      const end = DateTime.now().minus({ hours: 1 }).toJSDate();
      await ds
        .getRepository(Meeting)
        .update(id, { room: null, startAt: start, endAt: end });
      const res = await http()
        .post(`${API}/meetings/${id}/complete`)
        .set(as('org'))
        .send({ notes: 'কার্যবিবরণী' })
        .expect(200);
      expect((res.body as Detail).status).toBe('COMPLETED');
      expect((res.body as Detail).room).toBeNull();
    });
  });
});
