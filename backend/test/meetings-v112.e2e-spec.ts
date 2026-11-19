/**
 * v1.12 e2e (SPEC.md §6.4): duplicate meetings warn, they do not block.
 * - The ONLY blocking rule: the organizer is, at an overlapping time, the organizer or the
 *   internal chair of another SCHEDULED meeting (409, Bangla / English message).
 * - Every other overlap (shared officers, the organizer as a member elsewhere) is saved with a
 *   PENDING duplicate-meeting record, whatever the priorities.
 * - Notices: the shared officers and the lower meeting's organizer (both organizers on equal
 *   priority), once per person.
 * Each scenario uses its own future day so scenarios never overlap.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MESSAGE_CATALOG } from '../src/common/i18n/message-catalog';
import { hashPassword } from '../src/common/utils/password';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { MeetingConflict } from '../src/modules/meetings/entities/meeting-conflict.entity';
import { Meeting } from '../src/modules/meetings/entities/meeting.entity';
import { ConflictStatus } from '../src/modules/meetings/enums/conflict-status.enum';
import { MEETING_MESSAGES } from '../src/modules/meetings/meetings.messages';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { NotificationType } from '../src/modules/notifications/enums/notification-type.enum';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';

const API = '/api/v1';
const PASSWORD = 'E2ePass1234';
const ZONE = 'Asia/Dhaka';
const DOMAIN = 'e2e-v112.test';

const BN_409 = 'আয়োজক একই সময়ে আরেকটি সভার আয়োজক বা সভাপতি।';
const EN_409 =
  'The organizer is already the organizer or chair of another meeting at this time.';

type Who = 'director' | 'dd1' | 'dd2' | 'so' | 'shared' | 'shared2';

function slot(day: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return DateTime.now()
    .setZone(ZONE)
    .startOf('day')
    .plus({ days: day })
    .set({ hour: h, minute: m })
    .toISO({ suppressMilliseconds: true })!;
}

interface ErrorBody {
  message: string;
  code: string;
  blocking: Array<{ meetingId: string }>;
}

describe('v1.12: duplicate meetings warn, only the organizer rule blocks (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const ids = {} as Record<Who, string>;
  const tokens = {} as Record<Who, string>;

  const http = () => request(app.getHttpServer());
  const as = (who: Who, lang?: string) => ({
    Authorization: `Bearer ${tokens[who]}`,
    ...(lang ? { 'Accept-Language': lang } : {}),
  });
  const create = (who: Who, payload: Record<string, unknown>, lang?: string) =>
    http()
      .post(`${API}/meetings`)
      .set(as(who, lang))
      .send({ room: 'সম্মেলন কক্ষ', ...payload });
  const patch = (
    who: Who,
    id: string,
    payload: Record<string, unknown>,
    lang?: string,
  ) => http().patch(`${API}/meetings/${id}`).set(as(who, lang)).send(payload);
  const idOf = (res: request.Response) => (res.body as { id: string }).id;
  /** Conflict notices to `who` about meeting `meetingId` (the link of the notice). */
  const conflictNotices = (who: Who, meetingId?: string) =>
    ds.getRepository(Notification).find({
      where: {
        userId: ids[who],
        type: NotificationType.MEETING_CONFLICT,
        ...(meetingId ? { link: `/meetings/${meetingId}` } : {}),
      },
    });
  const pendingBetween = (a: string, b: string) =>
    ds.getRepository(MeetingConflict).find({
      where: {
        status: ConflictStatus.PENDING,
        higherMeetingId: In([a, b]),
        lowerMeetingId: In([a, b]),
      },
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

    const designationIds: Record<string, string> = {};
    for (const [nameEn, nameBn, priority] of [
      ['V112 Director', 'পরিচালক', 4],
      ['V112 Deputy Director', 'উপপরিচালক', 6],
      ['V112 Statistical Officer', 'পরিসংখ্যান কর্মকর্তা', 7],
    ] as const) {
      designationIds[nameEn] = (
        await ds
          .getRepository(Designation)
          .insert({ nameBn: `${nameBn} (v1.12)`, nameEn, priority })
      ).identifiers[0].id as string;
    }
    const passwordHash = await hashPassword(PASSWORD);
    const people: Array<[Who, string, string]> = [
      ['director', 'V112 Director', 'পরিচালক মহোদয়'],
      ['dd1', 'V112 Deputy Director', 'উপপরিচালক এক'],
      ['dd2', 'V112 Deputy Director', 'উপপরিচালক দুই'],
      ['so', 'V112 Statistical Officer', 'পরিসংখ্যান কর্মকর্তা'],
      ['shared', 'V112 Statistical Officer', 'যৌথ কর্মকর্তা'],
      ['shared2', 'V112 Statistical Officer', 'দ্বিতীয় যৌথ কর্মকর্তা'],
    ];
    for (const [who, designation, nameBn] of people) {
      ids[who] = (
        await ds.getRepository(User).insert({
          loginEmail: `${who}@${DOMAIN}`,
          notificationEmail: `${who}@${DOMAIN}`,
          passwordHash,
          nameBn,
          nameEn: `V112 ${who}`,
          designationId: designationIds[designation],
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

  it('the catalog carries the new 409 message in both languages', () => {
    expect(MEETING_MESSAGES.blocking).toBe(BN_409);
    expect(MESSAGE_CATALOG.TIME_CONFLICT_BLOCKING).toEqual({
      bn: BN_409,
      en: EN_409,
    });
  });

  // ================================================================= create

  describe('create', () => {
    it('organizer-organizer: 409 in Bangla and English, nothing saved', async () => {
      const own = idOf(
        await create('dd1', {
          title: 'নিজের প্রথম সভা',
          startAt: slot(70, '10:00'),
          endAt: slot(70, '11:00'),
        }).expect(201),
      );
      const payload = {
        title: 'নিজের দ্বিতীয় সভা',
        startAt: slot(70, '10:30'),
        endAt: slot(70, '11:30'),
      };
      const bn = await create('dd1', payload).expect(409);
      expect(bn.body as ErrorBody).toMatchObject({
        message: BN_409,
        code: 'TIME_CONFLICT_BLOCKING',
        blocking: [{ meetingId: own }],
      });
      const en = await create('dd1', payload, 'en').expect(409);
      expect(en.body as ErrorBody).toMatchObject({
        message: EN_409,
        code: 'TIME_CONFLICT_BLOCKING',
      });
      expect(
        await ds
          .getRepository(Meeting)
          .countBy({ title: 'নিজের দ্বিতীয় সভা', organizerId: ids.dd1 }),
      ).toBe(0);
    });

    it('organizer-chair: blocked whatever the priority; check-conflicts says blocking', async () => {
      // so (7) organizes, the director (4) chairs. The director cannot organize at that time.
      const chaired = idOf(
        await create('so', {
          title: 'পরিচালক সভাপতি',
          startAt: slot(71, '10:00'),
          endAt: slot(71, '11:00'),
          chairId: ids.director,
        }).expect(201),
      );
      const payload = {
        title: 'পরিচালকের নিজের সভা',
        startAt: slot(71, '10:30'),
        endAt: slot(71, '11:30'),
      };
      const dry = await http()
        .post(`${API}/meetings/check-conflicts`)
        .set(as('director'))
        .send(payload)
        .expect(200);
      expect(dry.body).toMatchObject({
        allowed: false,
        blocking: [{ meetingId: chaired }],
        warnings: [],
      });
      const res = await create('director', payload, 'en').expect(409);
      expect((res.body as ErrorBody).message).toBe(EN_409);
    });

    it('organizer-member: only a warning; saved; one notice to the lower organizer', async () => {
      // dd2 (6) has so as a member. so (7) organizes at the same time → warning, saved.
      const higher = idOf(
        await create('dd2', {
          title: 'উপপরিচালকের সভা ৭২',
          startAt: slot(72, '10:00'),
          endAt: slot(72, '11:00'),
          participantIds: [ids.so],
        }).expect(201),
      );
      const dry = await http()
        .post(`${API}/meetings/check-conflicts`)
        .set(as('so'))
        .send({
          title: 'যাচাই',
          startAt: slot(72, '10:30'),
          endAt: slot(72, '11:30'),
        })
        .expect(200);
      expect(dry.body).toMatchObject({
        allowed: true,
        blocking: [],
        warnings: [{ meetingId: higher }],
      });
      const lower = idOf(
        await create('so', {
          title: 'নিজের সভা ৭২',
          startAt: slot(72, '10:30'),
          endAt: slot(72, '11:30'),
        }).expect(201),
      );
      expect(await pendingBetween(higher, lower)).toEqual([
        expect.objectContaining({
          higherMeetingId: higher,
          lowerMeetingId: lower,
          userId: ids.so,
        }),
      ]);
      // so is the lower organizer AND the shared officer: exactly one notice.
      expect(await conflictNotices('so', lower)).toHaveLength(1);
      expect(await conflictNotices('dd2')).toHaveLength(0);
    });

    it('officer overlaps of any priority only warn and save', async () => {
      const base = idOf(
        await create('so', {
          title: 'ভিত্তি সভা ৭৩',
          startAt: slot(73, '10:00'),
          endAt: slot(73, '11:00'),
          participantIds: [ids.shared],
        }).expect(201),
      );
      // higher (director 4), equal-ish (dd1 6) — and a lower one (so's meeting stays 7)
      const byDirector = idOf(
        await create('director', {
          title: 'পরিচালক ৭৩',
          startAt: slot(73, '10:15'),
          endAt: slot(73, '11:15'),
          participantIds: [ids.shared],
        }).expect(201),
      );
      const byDd1 = idOf(
        await create('dd1', {
          title: 'উপপরিচালক ৭৩',
          startAt: slot(73, '10:30'),
          endAt: slot(73, '11:30'),
          participantIds: [ids.shared],
        }).expect(201),
      );
      expect(await pendingBetween(byDirector, base)).toEqual([
        expect.objectContaining({
          higherMeetingId: byDirector,
          lowerMeetingId: base,
        }),
      ]);
      expect(await pendingBetween(byDd1, base)).toEqual([
        expect.objectContaining({
          higherMeetingId: byDd1,
          lowerMeetingId: base,
        }),
      ]);
      expect(await pendingBetween(byDd1, byDirector)).toEqual([
        expect.objectContaining({
          higherMeetingId: byDirector,
          lowerMeetingId: byDd1,
        }),
      ]);
    });

    it('equal priority notifies BOTH organizers (each about their own meeting) and the shared officer once', async () => {
      const first = idOf(
        await create('dd1', {
          title: 'প্রথম উপপরিচালক ৭৪',
          startAt: slot(74, '10:00'),
          endAt: slot(74, '11:00'),
          participantIds: [ids.shared2],
        }).expect(201),
      );
      const second = idOf(
        await create('dd2', {
          title: 'দ্বিতীয় উপপরিচালক ৭৪',
          startAt: slot(74, '10:30'),
          endAt: slot(74, '11:30'),
          participantIds: [ids.shared2],
        }).expect(201),
      );
      expect(await conflictNotices('dd1', first)).toHaveLength(1);
      expect(await conflictNotices('dd2', second)).toHaveLength(1);
      expect(await conflictNotices('dd1', second)).toHaveLength(0);
      const toShared = [
        ...(await conflictNotices('shared2', first)),
        ...(await conflictNotices('shared2', second)),
      ];
      expect(toShared).toHaveLength(1);
      // Both organizers see the record on their duplicate-meeting page.
      for (const who of ['dd1', 'dd2'] as const) {
        const mine = await http()
          .get(`${API}/conflicts/mine`)
          .set(as(who))
          .expect(200);
        expect(
          (mine.body as Array<{ lowerMeeting: { id: string } }>).some(
            (c) => c.lowerMeeting.id === second,
          ),
        ).toBe(true);
      }
    });

    it('lower priority notifies only the lower organizer (and the shared officer)', async () => {
      const higher = idOf(
        await create('director', {
          title: 'পরিচালক ৭৫',
          startAt: slot(75, '10:00'),
          endAt: slot(75, '11:00'),
          participantIds: [ids.shared],
        }).expect(201),
      );
      const before = (await conflictNotices('director')).length;
      const lower = idOf(
        await create('so', {
          title: 'নিম্ন সভা ৭৫',
          startAt: slot(75, '10:30'),
          endAt: slot(75, '11:30'),
          participantIds: [ids.shared],
        }).expect(201),
      );
      expect(await conflictNotices('so', lower)).toHaveLength(1);
      expect(await conflictNotices('shared', lower)).toHaveLength(1);
      expect(await conflictNotices('director')).toHaveLength(before);
      expect(await conflictNotices('shared', higher)).toHaveLength(0);
    });
  });

  // ================================================================= edit

  describe('edit', () => {
    it('moving onto a meeting the organizer organizes → 409 (bn + en); unchanged', async () => {
      const own = idOf(
        await create('dd1', {
          title: 'সভা ক ৮০',
          startAt: slot(80, '10:00'),
          endAt: slot(80, '11:00'),
        }).expect(201),
      );
      const moved = idOf(
        await create('dd1', {
          title: 'সভা খ ৮০',
          startAt: slot(80, '12:00'),
          endAt: slot(80, '13:00'),
        }).expect(201),
      );
      const to = { startAt: slot(80, '10:30'), endAt: slot(80, '11:30') };
      const bn = await patch('dd1', moved, to).expect(409);
      expect(bn.body as ErrorBody).toMatchObject({
        message: BN_409,
        blocking: [{ meetingId: own }],
      });
      const en = await patch('dd1', moved, to, 'en').expect(409);
      expect((en.body as ErrorBody).message).toBe(EN_409);
      const stored = await ds
        .getRepository(Meeting)
        .findOneByOrFail({ id: moved });
      expect(stored.startAt.toISOString()).toBe(
        new Date(slot(80, '12:00')).toISOString(),
      );
    });

    it('moving onto a meeting the organizer chairs → 409', async () => {
      await create('so', {
        title: 'dd1 সভাপতি ৮১',
        startAt: slot(81, '10:00'),
        endAt: slot(81, '11:00'),
        chairId: ids.dd1,
      }).expect(201);
      const moved = idOf(
        await create('dd1', {
          title: 'dd1 নিজের ৮১',
          startAt: slot(81, '12:00'),
          endAt: slot(81, '13:00'),
        }).expect(201),
      );
      const res = await patch('dd1', moved, {
        startAt: slot(81, '10:30'),
        endAt: slot(81, '11:30'),
      }).expect(409);
      expect((res.body as ErrorBody).message).toBe(BN_409);
    });

    it('moving onto a meeting where the organizer is only a member → saved with a record', async () => {
      const other = idOf(
        await create('dd2', {
          title: 'dd1 সদস্য ৮২',
          startAt: slot(82, '10:00'),
          endAt: slot(82, '11:00'),
          participantIds: [ids.dd1],
        }).expect(201),
      );
      const moved = idOf(
        await create('dd1', {
          title: 'dd1 নিজের ৮২',
          startAt: slot(82, '12:00'),
          endAt: slot(82, '13:00'),
        }).expect(201),
      );
      await patch('dd1', moved, {
        startAt: slot(82, '10:30'),
        endAt: slot(82, '11:30'),
      }).expect(200);
      expect(await pendingBetween(other, moved)).toEqual([
        expect.objectContaining({ userId: ids.dd1 }),
      ]);
    });

    it('moving into a higher meeting of a shared officer → saved; lower organizer notified; auto-resolves when moved away', async () => {
      const higher = idOf(
        await create('director', {
          title: 'পরিচালক ৮৩',
          startAt: slot(83, '10:00'),
          endAt: slot(83, '11:00'),
          participantIds: [ids.shared],
        }).expect(201),
      );
      const lower = idOf(
        await create('so', {
          title: 'নিম্ন ৮৩',
          startAt: slot(83, '12:00'),
          endAt: slot(83, '13:00'),
          participantIds: [ids.shared],
        }).expect(201),
      );
      const directorBefore = (await conflictNotices('director')).length;
      await patch('so', lower, {
        startAt: slot(83, '10:30'),
        endAt: slot(83, '11:30'),
      }).expect(200);
      const [record] = await pendingBetween(higher, lower);
      expect(record).toMatchObject({
        higherMeetingId: higher,
        lowerMeetingId: lower,
        userId: ids.shared,
      });
      expect(await conflictNotices('so', lower)).toHaveLength(1);
      expect(await conflictNotices('shared', lower)).toHaveLength(1);
      expect(await conflictNotices('director')).toHaveLength(directorBefore);

      await patch('so', lower, {
        startAt: slot(83, '12:00'),
        endAt: slot(83, '13:00'),
      }).expect(200);
      expect(
        (
          await ds
            .getRepository(MeetingConflict)
            .findOneByOrFail({ id: record.id })
        ).status,
      ).toBe(ConflictStatus.RESOLVED);
    });

    it('moving into an equal-priority meeting notifies both organizers', async () => {
      const first = idOf(
        await create('dd1', {
          title: 'প্রথম ৮৪',
          startAt: slot(84, '10:00'),
          endAt: slot(84, '11:00'),
          participantIds: [ids.shared2],
        }).expect(201),
      );
      const moved = idOf(
        await create('dd2', {
          title: 'দ্বিতীয় ৮৪',
          startAt: slot(84, '12:00'),
          endAt: slot(84, '13:00'),
          participantIds: [ids.shared2],
        }).expect(201),
      );
      await patch('dd2', moved, {
        startAt: slot(84, '10:30'),
        endAt: slot(84, '11:30'),
      }).expect(200);
      expect(await conflictNotices('dd1', first)).toHaveLength(1);
      expect(await conflictNotices('dd2', moved)).toHaveLength(1);
      expect(await pendingBetween(first, moved)).toHaveLength(1);
    });
  });
});
