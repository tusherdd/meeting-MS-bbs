/**
 * Release v1.9 e2e (SPEC.md §13.17) on the TEST database:
 * - the organizer is DISPLAYED as their current wing (designation without a wing): API fields
 *   on meetings, conflicts, 409 clashes and reports, and the Bangla notice texts; notices are
 *   still DELIVERED to the people as before;
 * - the venue (স্থান, field `room`) is required on create and edit; meetings stored without a
 *   venue (before v1.9) still load everywhere, and an edit must give them one.
 * Own users, designations, wings and days (60+), so it never touches the other e2e files.
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
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { Meeting } from '../src/modules/meetings/entities/meeting.entity';
import { MEETING_MESSAGES } from '../src/modules/meetings/meetings.messages';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { NotificationType } from '../src/modules/notifications/enums/notification-type.enum';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import { Wing } from '../src/modules/wings/entities/wing.entity';

const API = '/api/v1';
const PASSWORD = 'E2ePass1234';
const ZONE = 'Asia/Dhaka';
const DOMAIN = 'e2e-v19.test';

/** dd: Deputy Director with a wing; nowing: Deputy Director without a wing; so: Statistical Officer. */
type Who = 'dd' | 'nowing' | 'so';

const WING = { nameBn: 'কম্পিউটার উইং (v1.9)', nameEn: 'V19 Computer Wing' };
const WING2 = { nameBn: 'জনশুমারি উইং (v1.9)', nameEn: 'V19 Census Wing' };
const DD_DESIGNATION_BN = 'উপপরিচালক (v1.9)';

function day(offset: number): DateTime {
  return DateTime.now().setZone(ZONE).startOf('day').plus({ days: offset });
}

/** One Dhaka day for GET /meetings (`from` = ends after, `to` = starts before). */
function dayRange(offset: number): { from: string; to: string } {
  const iso = (d: DateTime) => d.toISO({ suppressMilliseconds: true })!;
  return { from: iso(day(offset)), to: iso(day(offset + 1)) };
}

function slot(offset: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return day(offset)
    .set({ hour: h, minute: m })
    .toISO({ suppressMilliseconds: true })!;
}

interface WingRef {
  id: string;
  nameBn: string;
  nameEn: string;
}

interface Summary {
  id: string;
  room: string | null;
  organizer: {
    id: string;
    nameBn: string;
    designation: { nameBn: string } | null;
    wing: WingRef | null;
  };
}

interface ErrorBody {
  message: string | string[];
  code: string;
  codes?: string[];
}

describe('v1.9: organizer shown as the wing, venue required (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const ids = {} as Record<Who, string>;
  const tokens = {} as Record<Who, string>;
  const wingIds = {} as Record<'wing' | 'wing2', string>;

  const http = () => request(app.getHttpServer());
  const as = (who: Who, lang?: 'en' | 'bn') => ({
    Authorization: `Bearer ${tokens[who]}`,
    ...(lang ? { 'Accept-Language': lang } : {}),
  });
  const create = (who: Who, payload: Record<string, unknown>) =>
    http().post(`${API}/meetings`).set(as(who)).send(payload);
  const patch = (who: Who, id: string, payload: Record<string, unknown>) =>
    http().patch(`${API}/meetings/${id}`).set(as(who)).send(payload);
  const invitesOf = (who: Who) =>
    ds.getRepository(Notification).find({
      where: { userId: ids[who], type: NotificationType.MEETING_INVITED },
      order: { createdAt: 'ASC' },
    });
  const messages = (res: request.Response): string[] => {
    const m = (res.body as ErrorBody).message;
    return Array.isArray(m) ? m : [m];
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

    const designation = async (
      nameBn: string,
      nameEn: string,
      priority: number,
    ) =>
      (await ds.getRepository(Designation).insert({ nameBn, nameEn, priority }))
        .identifiers[0].id as string;
    const ddDesignation = await designation(
      DD_DESIGNATION_BN,
      'V19 Deputy Director',
      6,
    );
    const soDesignation = await designation(
      'পরিসংখ্যান কর্মকর্তা (v1.9)',
      'V19 Statistical Officer',
      7,
    );
    wingIds.wing = (await ds.getRepository(Wing).insert({ ...WING }))
      .identifiers[0].id as string;
    wingIds.wing2 = (await ds.getRepository(Wing).insert({ ...WING2 }))
      .identifiers[0].id as string;

    const passwordHash = await hashPassword(PASSWORD);
    const people: Array<[Who, string, string | null, string]> = [
      ['dd', ddDesignation, wingIds.wing, 'উপপরিচালক উইংসহ'],
      ['nowing', ddDesignation, null, 'উপপরিচালক উইং ছাড়া'],
      ['so', soDesignation, wingIds.wing2, 'পরিসংখ্যান কর্মকর্তা'],
    ];
    for (const [who, designationId, wingId, nameBn] of people) {
      ids[who] = (
        await ds.getRepository(User).insert({
          loginEmail: `${who}@${DOMAIN}`,
          notificationEmail: `${who}@${DOMAIN}`,
          passwordHash,
          nameBn,
          nameEn: `V19 ${who}`,
          designationId,
          wingId,
          role: UserRole.OFFICER,
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

  // ---------------------------------------------------------------- A. organizer as wing

  describe('A. the organizer is displayed as the wing', () => {
    let meetingId: string;

    it('detail and list carry the organizer’s wing (Bangla + English) next to the person', async () => {
      const res = await create('dd', {
        title: 'উইং প্রদর্শন সভা',
        startAt: slot(60, '10:00'),
        endAt: slot(60, '11:00'),
        room: 'সম্মেলন কক্ষ (কক্ষ নং ৫০১)',
        participantIds: [ids.so],
      }).expect(201);
      const m = res.body as Summary;
      meetingId = m.id;
      expect(m.organizer.id).toBe(ids.dd); // the person stays (permissions, admin pages)
      expect(m.organizer.wing).toEqual({ id: wingIds.wing, ...WING });

      const list = await http()
        .get(`${API}/meetings`)
        .query(dayRange(60))
        .set(as('so'))
        .expect(200);
      const item = (list.body as { items: Summary[] }).items.find(
        (i) => i.id === meetingId,
      );
      expect(item?.organizer.wing?.nameBn).toBe(WING.nameBn);
      expect(item?.organizer.wing?.nameEn).toBe(WING.nameEn);
    });

    it('the bell notice says "আয়োজক: <wing>" and is still delivered to the invitee', async () => {
      const [invite] = await invitesOf('so');
      expect(invite.userId).toBe(ids.so);
      expect(invite.body).toContain(`আয়োজক: ${WING.nameBn}`);
      expect(invite.body).not.toContain('উপপরিচালক উইংসহ'); // not the person's name
      expect(invite.body).toContain('স্থান: সম্মেলন কক্ষ (কক্ষ নং ৫০১)');
    });

    it('uses the CURRENT wing (no snapshot)', async () => {
      await ds.getRepository(User).update(ids.dd, { wingId: wingIds.wing2 });
      try {
        const res = await http()
          .get(`${API}/meetings/${meetingId}`)
          .set(as('dd'))
          .expect(200);
        expect((res.body as Summary).organizer.wing?.nameBn).toBe(WING2.nameBn);
      } finally {
        await ds.getRepository(User).update(ids.dd, { wingId: wingIds.wing });
      }
    });

    it('an organizer without a wing: wing is null and notices show the designation', async () => {
      const res = await create('nowing', {
        title: 'উইং ছাড়া আয়োজক',
        startAt: slot(61, '10:00'),
        endAt: slot(61, '11:00'),
        room: 'অনলাইন',
        participantIds: [ids.so],
      }).expect(201);
      const m = res.body as Summary;
      expect(m.organizer.wing).toBeNull();
      expect(m.organizer.designation?.nameBn).toBe(DD_DESIGNATION_BN);

      const invites = await invitesOf('so');
      const invite = invites[invites.length - 1];
      expect(invite.body).toContain(`আয়োজক: ${DD_DESIGNATION_BN}`);
      expect(invite.body).not.toContain('উপপরিচালক উইং ছাড়া');
    });

    it('409 clashes and the conflicts list carry the organizer’s wing', async () => {
      // so (priority 7) first, then dd (6) over it with so shared → a conflict.
      const lower = await create('so', {
        title: 'নিম্ন অগ্রাধিকারের সভা',
        startAt: slot(62, '10:00'),
        endAt: slot(62, '11:00'),
        room: 'কক্ষ ২০১',
      }).expect(201);
      await create('dd', {
        title: 'উচ্চ অগ্রাধিকারের সভা',
        startAt: slot(62, '10:30'),
        endAt: slot(62, '11:30'),
        room: 'কক্ষ ৫০১',
        participantIds: [ids.so],
      }).expect(201);

      const mine = await http()
        .get(`${API}/conflicts/mine`)
        .set(as('so'))
        .expect(200);
      const conflict = (
        mine.body as Array<{
          lowerMeeting: { id: string; organizerWing: string | null };
          higherMeeting: {
            organizerWing: string | null;
            organizerWingEn: string | null;
          };
        }>
      ).find((c) => c.lowerMeeting.id === (lower.body as Summary).id);
      expect(conflict?.higherMeeting.organizerWing).toBe(WING.nameBn);
      expect(conflict?.higherMeeting.organizerWingEn).toBe(WING.nameEn);
      expect(conflict?.lowerMeeting.organizerWing).toBe(WING2.nameBn);

      // nowing (6) at the same time with so → blocked by dd's meeting (6 vs 6).
      const blocked = await create('nowing', {
        title: 'আটকে যাবে',
        startAt: slot(62, '10:30'),
        endAt: slot(62, '11:00'),
        room: 'কক্ষ ৩০১',
        participantIds: [ids.so],
      }).expect(409);
      const clash = (
        blocked.body as {
          blocking: Array<{
            organizer: { wing: string | null; wingEn: string | null };
          }>;
        }
      ).blocking.find((b) => b.organizer.wing === WING.nameBn);
      expect(clash?.organizer.wingEn).toBe(WING.nameEn);
    });

    it('report rows carry the organizer’s wing', async () => {
      const res = await http()
        .get(`${API}/reports/me`)
        .query({ period: 'day', date: day(60).toISODate() })
        .set(as('so'))
        .expect(200);
      const items = (
        res.body as {
          meetings: {
            items: Array<{
              id: string;
              organizerWingBn: string | null;
              organizerWingEn: string | null;
            }>;
          };
        }
      ).meetings.items;
      const row = items.find((i) => i.id === meetingId);
      expect(row?.organizerWingBn).toBe(WING.nameBn);
      expect(row?.organizerWingEn).toBe(WING.nameEn);
    });
  });

  // ---------------------------------------------------------------- B. venue required

  describe('B. the venue is required', () => {
    const base = () => ({
      title: 'স্থান যাচাই সভা',
      startAt: slot(63, '10:00'),
      endAt: slot(63, '11:00'),
    });

    it.each([
      ['missing', {}],
      ['empty', { room: '' }],
      ['only spaces', { room: '   ' }],
      ['null', { room: null }],
    ])(
      'create without a venue (%s) → 400 "স্থান লিখতে হবে।"',
      async (_, extra) => {
        const res = await create('dd', { ...base(), ...extra }).expect(400);
        expect(messages(res)).toEqual([MEETING_MESSAGES.venueRequired]);
        expect((res.body as ErrorBody).code).toBe('ROOM_REQUIRED');
      },
    );

    it('in English: "Venue is required."', async () => {
      const res = await http()
        .post(`${API}/meetings`)
        .set(as('dd', 'en'))
        .send(base())
        .expect(400);
      expect(messages(res)).toEqual(['Venue is required.']);
    });

    it('a venue longer than 100 characters → 400', async () => {
      const res = await create('dd', {
        ...base(),
        room: 'ক'.repeat(101),
      }).expect(400);
      expect(messages(res)).toEqual([MEETING_MESSAGES.venueTooLong]);
    });

    it('edit: the venue cannot be cleared; it can be changed (trimmed)', async () => {
      const created = await create('dd', {
        ...base(),
        room: 'কক্ষ ১০১',
      }).expect(201);
      const id = (created.body as Summary).id;
      for (const room of [null, '', '  ']) {
        const res = await patch('dd', id, { room }).expect(400);
        expect(messages(res)).toEqual([MEETING_MESSAGES.venueRequired]);
      }
      const ok = await patch('dd', id, { room: '  অনলাইন ' }).expect(200);
      expect((ok.body as Summary).room).toBe('অনলাইন');
      // Leaving the venue out keeps it.
      const kept = await patch('dd', id, { title: 'নতুন শিরোনাম সভা' }).expect(
        200,
      );
      expect((kept.body as Summary).room).toBe('অনলাইন');
    });

    it('the live conflict check does not need a venue', async () => {
      await http()
        .post(`${API}/meetings/check-conflicts`)
        .set(as('dd'))
        .send({ ...base(), participantIds: [] })
        .expect(200);
    });

    it('a meeting stored without a venue (before v1.9) still loads; an edit must add one', async () => {
      const created = await create('dd', {
        title: 'পুরনো সভা',
        startAt: slot(64, '10:00'),
        endAt: slot(64, '11:00'),
        room: 'কক্ষ ১০১',
        participantIds: [ids.so],
      }).expect(201);
      const id = (created.body as Summary).id;
      // Simulate a meeting created before v1.9.
      await ds.getRepository(Meeting).update(id, { room: null });

      const detail = await http()
        .get(`${API}/meetings/${id}`)
        .set(as('so'))
        .expect(200);
      expect((detail.body as Summary).room).toBeNull();

      const list = await http()
        .get(`${API}/meetings`)
        .query(dayRange(64))
        .set(as('so'))
        .expect(200);
      expect(
        (list.body as { items: Summary[] }).items.find((i) => i.id === id)
          ?.room,
      ).toBeNull();

      const report = await http()
        .get(`${API}/reports/me`)
        .query({ period: 'day', date: day(64).toISODate() })
        .set(as('so'))
        .expect(200);
      expect(
        (report.body as { meetings: { items: Summary[] } }).meetings.items.find(
          (i) => i.id === id,
        )?.room,
      ).toBeNull();

      // An edit without a venue is refused; with one it works.
      const refused = await patch('dd', id, {
        title: 'পুরনো সভা (হালনাগাদ)',
      }).expect(400);
      expect(messages(refused)).toEqual([MEETING_MESSAGES.venueRequired]);
      const fixed = await patch('dd', id, {
        title: 'পুরনো সভা (হালনাগাদ)',
        room: 'সম্মেলন কক্ষ',
      }).expect(200);
      expect((fixed.body as Summary).room).toBe('সম্মেলন কক্ষ');
    });

    it('cancelling a meeting without a venue still works (it is not an edit)', async () => {
      const created = await create('dd', {
        title: 'পুরনো সভা বাতিল',
        startAt: slot(65, '10:00'),
        endAt: slot(65, '11:00'),
        room: 'কক্ষ ১০১',
      }).expect(201);
      const id = (created.body as Summary).id;
      await ds.getRepository(Meeting).update(id, { room: null });
      await http()
        .post(`${API}/meetings/${id}/cancel`)
        .set(as('dd'))
        .send({ reason: 'জরুরি কারণে স্থগিত' })
        .expect(200);
    });
  });
});
