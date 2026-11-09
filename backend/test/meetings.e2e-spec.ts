/**
 * Step 8 e2e: meetings and the priority conflict engine, on the TEST database.
 * Each scenario uses its own future day (slot(day, time)) so scenarios never overlap.
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
import { EmailOutbox } from '../src/modules/mail/entities/email-outbox.entity';
import { MeetingConflict } from '../src/modules/meetings/entities/meeting-conflict.entity';
import { MeetingParticipant } from '../src/modules/meetings/entities/meeting-participant.entity';
import { Meeting } from '../src/modules/meetings/entities/meeting.entity';
import { ConflictStatus } from '../src/modules/meetings/enums/conflict-status.enum';
import { MeetingStatus } from '../src/modules/meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../src/modules/meetings/enums/participant-role.enum';
import { MeetingSchedulerService } from '../src/modules/meetings/meeting-scheduler.service';
import { MEETING_MESSAGES } from '../src/modules/meetings/meetings.messages';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { NotificationType } from '../src/modules/notifications/enums/notification-type.enum';
import { User } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';

const API = '/api/v1';
const PASSWORD = 'E2ePass1234';
const ZONE = 'Asia/Dhaka';

type Who =
  | 'secretary'
  | 'director'
  | 'dd1'
  | 'dd2'
  | 'so'
  | 'shared'
  | 'shared2'
  | 'outsider'
  | 'admin'
  | 'superadmin';

/** ISO time (with +06:00) on Dhaka-today + `day` days, e.g. slot(3, '10:30'). */
function slot(day: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return DateTime.now()
    .setZone(ZONE)
    .startOf('day')
    .plus({ days: day })
    .set({ hour: h, minute: m })
    .toISO({ suppressMilliseconds: true })!;
}

interface Body {
  id: string;
  message: string | string[];
  [k: string]: unknown;
}

describe('Meetings and conflict engine (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const ids = {} as Record<Who, string>;
  const tokens = {} as Record<Who, string>;
  const designationIds = {} as Record<string, string>;

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const body = (res: request.Response) => res.body as Body;

  const create = (who: Who, payload: Record<string, unknown>) =>
    http().post(`${API}/meetings`).set(as(who)).send(payload);

  const notificationsOf = (who: Who, type: NotificationType) =>
    ds.getRepository(Notification).find({ where: { userId: ids[who], type } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    ds = app.get(DataSource);
    expect(ds.options.database).toMatch(/_test$/); // never the dev database

    for (const [nameEn, nameBn, priority] of [
      ['Secretary', 'সচিব', 1],
      ['Director', 'পরিচালক', 4],
      ['Deputy Director', 'উপপরিচালক', 6],
      ['Statistical Officer', 'পরিসংখ্যান কর্মকর্তা', 7],
    ] as const) {
      designationIds[nameEn] = (
        await ds.getRepository(Designation).insert({ nameBn, nameEn, priority })
      ).identifiers[0].id as string;
    }
    const passwordHash = await hashPassword(PASSWORD);
    const people: Array<[Who, string | null, UserRole, string]> = [
      ['secretary', 'Secretary', UserRole.OFFICER, 'মোঃ সচিব'],
      ['director', 'Director', UserRole.OFFICER, 'পরিচালক সাহেব'],
      ['dd1', 'Deputy Director', UserRole.OFFICER, 'উপপরিচালক এক'],
      ['dd2', 'Deputy Director', UserRole.OFFICER, 'উপপরিচালক দুই'],
      ['so', 'Statistical Officer', UserRole.OFFICER, 'পরিসংখ্যান কর্মকর্তা'],
      ['shared', 'Statistical Officer', UserRole.OFFICER, 'যৌথ কর্মকর্তা'],
      ['shared2', 'Statistical Officer', UserRole.OFFICER, 'দ্বিতীয় যৌথ'],
      ['outsider', 'Statistical Officer', UserRole.OFFICER, 'বাইরের কর্মকর্তা'],
      ['admin', 'Deputy Director', UserRole.ADMIN, 'প্রশাসক'],
      ['superadmin', null, UserRole.SUPER_ADMIN, 'সুপার অ্যাডমিন'],
    ];
    for (const [who, designation, role, nameBn] of people) {
      ids[who] = (
        await ds.getRepository(User).insert({
          loginEmail: `${who}@e2e-meetings.test`,
          notificationEmail: `${who}@e2e-meetings.test`,
          passwordHash,
          nameBn,
          nameEn: `E2EM ${who}`,
          designationId: designation ? designationIds[designation] : null,
          role,
          mustChangePassword: false,
        })
      ).identifiers[0].id as string;
      const res = await http()
        .post(`${API}/auth/login`)
        .send({ loginEmail: `${who}@e2e-meetings.test`, password: PASSWORD });
      tokens[who] = (res.body as { accessToken: string }).accessToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------- higher priority wins

  describe('Secretary (1) over a Statistical Officer (7) with a shared officer', () => {
    let lowerId: string;
    let higherId: string;

    it('lower meeting first, then the higher one is saved (201) and a conflict is recorded', async () => {
      lowerId = body(
        await create('so', {
          title: 'মাঠ জরিপ প্রস্তুতি সভা',
          startAt: slot(2, '10:00'),
          endAt: slot(2, '11:00'),
          participantIds: [ids.shared],
        }).expect(201),
      ).id;

      const res = await create('secretary', {
        title: 'জরুরি সমন্বয় সভা',
        startAt: slot(2, '10:30'),
        endAt: slot(2, '11:30'),
        room: 'সম্মেলন কক্ষ',
        participantIds: [ids.shared],
      }).expect(201);
      higherId = body(res).id;
      expect(res.body).toMatchObject({
        priority: 1,
        status: 'SCHEDULED',
        myRole: 'ORGANIZER',
      });

      const conflicts = await ds.getRepository(MeetingConflict).find({
        where: { higherMeetingId: higherId },
      });
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({
        lowerMeetingId: lowerId,
        userId: ids.shared,
        status: ConflictStatus.PENDING,
      });
    });

    it('notifies the lower organizer (no title of the higher meeting) and the shared officer (with title)', async () => {
      const toOrganizer = await notificationsOf(
        'so',
        NotificationType.MEETING_CONFLICT,
      );
      expect(toOrganizer).toHaveLength(1);
      expect(toOrganizer[0].body).toContain('সচিব'); // N organizer's designation
      expect(toOrganizer[0].body).not.toContain('জরুরি সমন্বয় সভা'); // N title hidden
      expect(toOrganizer[0].body).toContain('মাঠ জরিপ প্রস্তুতি সভা'); // own meeting named
      expect(toOrganizer[0].link).toBe(`/meetings/${lowerId}`);

      const toShared = await notificationsOf(
        'shared',
        NotificationType.MEETING_CONFLICT,
      );
      expect(toShared).toHaveLength(1);
      expect(toShared[0].body).toContain('জরুরি সমন্বয় সভা'); // invited to N → may see it

      // invitations: the shared officer was invited twice; the organizers are not invited
      expect(
        await notificationsOf('shared', NotificationType.MEETING_INVITED),
      ).toHaveLength(2);
      expect(
        await notificationsOf('secretary', NotificationType.MEETING_INVITED),
      ).toHaveLength(0);
      // e-mail copies went to the outbox
      expect(
        await ds
          .getRepository(EmailOutbox)
          .countBy({ to: 'so@e2e-meetings.test' }),
      ).toBeGreaterThan(0);
      // audit
      expect(
        await ds
          .getRepository(AuditLog)
          .countBy({ action: AuditAction.CONFLICT_CREATED }),
      ).toBeGreaterThan(0);
    });

    it('GET /conflicts/mine shows it to the lower organizer and the shared officer, with both times', async () => {
      for (const who of ['so', 'shared'] as const) {
        const res = await http()
          .get(`${API}/conflicts/mine`)
          .set(as(who))
          .expect(200);
        const items = res.body as Array<{
          higherMeeting: {
            id: string;
            title: string;
            startAt: string;
            organizedByMe: boolean;
          };
          lowerMeeting: { id: string; startAt: string; organizedByMe: boolean };
        }>;
        const item = items.find((i) => i.higherMeeting.id === higherId)!;
        expect(item.lowerMeeting.id).toBe(lowerId);
        // Only the lower organizer gets the cancel/reschedule actions in the UI.
        expect(item.lowerMeeting.organizedByMe).toBe(who === 'so');
        expect(item.higherMeeting.organizedByMe).toBe(false);
        expect(item.higherMeeting.startAt).toBeDefined();
        expect(item.higherMeeting.title).toBe(
          who === 'shared' ? 'জরুরি সমন্বয় সভা' : MEETING_MESSAGES.hiddenTitle,
        );
      }
      const outsider = await http()
        .get(`${API}/conflicts/mine`)
        .set(as('outsider'))
        .expect(200);
      expect(outsider.body).toEqual([]);
    });

    it('auto-resolves when the lower meeting is cancelled; cancellation notices go out', async () => {
      await http()
        .post(`${API}/meetings/${lowerId}/cancel`)
        .set(as('so'))
        .send({})
        .expect(400); // reason required
      await http()
        .post(`${API}/meetings/${lowerId}/cancel`)
        .set(as('so'))
        .send({ reason: 'উচ্চতর সভার কারণে স্থগিত' })
        .expect(200);
      const conflict = await ds.getRepository(MeetingConflict).findOneByOrFail({
        higherMeetingId: higherId,
      });
      expect(conflict.status).toBe(ConflictStatus.RESOLVED);
      expect(conflict.resolvedAt).toBeInstanceOf(Date);
      // Leaves the pending list, appears in the history.
      const pending = await http()
        .get(`${API}/conflicts/mine`)
        .set(as('so'))
        .expect(200);
      expect(
        (pending.body as Array<{ id: string }>).some(
          (c) => c.id === conflict.id,
        ),
      ).toBe(false);
      const history = await http()
        .get(`${API}/conflicts/mine?status=RESOLVED`)
        .set(as('so'))
        .expect(200);
      expect(
        (history.body as Array<{ id: string; status: string }>).find(
          (c) => c.id === conflict.id,
        )?.status,
      ).toBe(ConflictStatus.RESOLVED);
      await http()
        .get(`${API}/conflicts/mine?status=OPEN`)
        .set(as('so'))
        .expect(400);
      const cancelled = await notificationsOf(
        'shared',
        NotificationType.MEETING_CANCELLED,
      );
      expect(cancelled[0].body).toContain('উচ্চতর সভার কারণে স্থগিত');
    });
  });

  // ---------------------------------------------------------------- equal priority blocks

  describe('two Deputy Directors (6 vs 6)', () => {
    let firstId: string;

    it('the second one gets 409 with the blocking list; the title is hidden from an outsider; nothing saved', async () => {
      firstId = body(
        await create('dd1', {
          title: 'বাজেট পর্যালোচনা (গোপন শিরোনাম)',
          startAt: slot(3, '14:00'),
          endAt: slot(3, '15:00'),
          participantIds: [ids.shared],
        }).expect(201),
      ).id;

      const before = await ds
        .getRepository(Meeting)
        .countBy({ organizerId: ids.dd2 });
      const res = await create('dd2', {
        title: 'প্রশিক্ষণ সভা',
        startAt: slot(3, '14:30'),
        endAt: slot(3, '15:30'),
        participantIds: [ids.shared],
      }).expect(409);

      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'Conflict',
        message: MEETING_MESSAGES.blocking,
        blocking: [
          {
            meetingId: firstId,
            title: MEETING_MESSAGES.hiddenTitle,
            priority: 6,
            organizer: { name: 'উপপরিচালক এক', designation: 'উপপরিচালক' },
            sharedOfficers: [{ id: ids.shared, nameBn: 'যৌথ কর্মকর্তা' }],
          },
        ],
      });
      expect(JSON.stringify(res.body)).not.toContain('গোপন শিরোনাম');
      expect(
        await ds.getRepository(Meeting).countBy({ organizerId: ids.dd2 }),
      ).toBe(before);
    });

    it('an admin sees the real title in the 409 body', async () => {
      const res = await create('admin', {
        title: 'প্রশাসনিক সভা',
        startAt: slot(3, '14:15'),
        endAt: slot(3, '14:45'),
        participantIds: [ids.shared],
      }).expect(409);
      expect(
        (res.body as { blocking: Array<{ title: string }> }).blocking[0].title,
      ).toBe('বাজেট পর্যালোচনা (গোপন শিরোনাম)');
    });

    it('a lower-priority organizer (Statistical Officer 7 vs 6) is blocked too', async () => {
      await create('so', {
        title: 'নিম্ন অগ্রাধিকার',
        startAt: slot(3, '14:00'),
        endAt: slot(3, '14:30'),
        participantIds: [ids.shared],
      }).expect(409);
    });

    it('touching times (15:00–16:00 right after 14:00–15:00) do not clash', async () => {
      await create('dd2', {
        title: 'পরের সভা',
        startAt: slot(3, '15:00'),
        endAt: slot(3, '16:00'),
        participantIds: [ids.shared],
      }).expect(201);
    });

    it('no shared person → no clash even at the same time', async () => {
      await create('dd2', {
        title: 'আলাদা লোকের সভা',
        startAt: slot(3, '14:00'),
        endAt: slot(3, '15:00'),
        participantIds: [ids.outsider],
      }).expect(201);
    });

    it('check-conflicts gives the same answer without saving', async () => {
      const before = await ds.getRepository(Meeting).count();
      const res = await http()
        .post(`${API}/meetings/check-conflicts`)
        .set(as('director'))
        .send({
          title: 'পরীক্ষা',
          startAt: slot(3, '14:30'),
          endAt: slot(3, '15:30'),
          participantIds: [ids.shared],
        })
        .expect(200);
      // Director (4) beats both Deputy Directors (6): allowed, two meetings would be notified
      expect(res.body).toMatchObject({ allowed: true, blocking: [] });
      expect((res.body as { willNotify: unknown[] }).willNotify).toHaveLength(
        2,
      );
      expect(await ds.getRepository(Meeting).count()).toBe(before);
    });
  });

  // ---------------------------------------------------------------- auto-resolve on update

  describe('auto-resolve on reschedule and on participant removal', () => {
    async function pair(day: number) {
      const lower = body(
        await create('so', {
          title: 'নিম্ন সভা',
          startAt: slot(day, '09:00'),
          endAt: slot(day, '10:00'),
          participantIds: [ids.shared, ids.shared2],
        }).expect(201),
      ).id;
      const higher = body(
        await create('director', {
          title: 'উচ্চ সভা',
          startAt: slot(day, '09:30'),
          endAt: slot(day, '10:30'),
          participantIds: [ids.shared, ids.shared2],
        }).expect(201),
      ).id;
      const pending = await ds.getRepository(MeetingConflict).countBy({
        higherMeetingId: higher,
        status: ConflictStatus.PENDING,
      });
      expect(pending).toBe(2); // one per shared officer
      return { lower, higher };
    }

    it('rescheduling the lower meeting out of the overlap resolves its conflicts', async () => {
      const { lower, higher } = await pair(4);
      await http()
        .patch(`${API}/meetings/${lower}`)
        .set(as('so'))
        .send({ startAt: slot(4, '11:00'), endAt: slot(4, '12:00') })
        .expect(200);
      expect(
        await ds.getRepository(MeetingConflict).countBy({
          higherMeetingId: higher,
          status: ConflictStatus.PENDING,
        }),
      ).toBe(0);
      const updated = await notificationsOf(
        'shared',
        NotificationType.MEETING_UPDATED,
      );
      expect(updated.some((n) => n.body.includes('সময়:'))).toBe(true);
    });

    it('removing a shared officer from the higher meeting resolves only that conflict', async () => {
      const { higher } = await pair(5);
      await http()
        .patch(`${API}/meetings/${higher}`)
        .set(as('director'))
        .send({ participantIds: [ids.shared2] })
        .expect(200);
      const rows = await ds
        .getRepository(MeetingConflict)
        .find({ where: { higherMeetingId: higher } });
      expect(rows.find((r) => r.userId === ids.shared)?.status).toBe(
        ConflictStatus.RESOLVED,
      );
      expect(rows.find((r) => r.userId === ids.shared2)?.status).toBe(
        ConflictStatus.PENDING,
      );
      expect(
        await notificationsOf('shared', NotificationType.MEETING_REMOVED),
      ).not.toHaveLength(0);
    });

    it('updating a meeting does not clash with itself; still blocked by others', async () => {
      const own = body(
        await create('dd1', {
          title: 'নিজের সভা',
          startAt: slot(6, '10:00'),
          endAt: slot(6, '11:00'),
          participantIds: [ids.shared],
        }).expect(201),
      ).id;
      await http()
        .patch(`${API}/meetings/${own}`)
        .set(as('dd1'))
        .send({ startAt: slot(6, '10:15'), endAt: slot(6, '11:15') })
        .expect(200);
      await create('dd2', {
        title: 'অন্য উপপরিচালক',
        startAt: slot(6, '12:00'),
        endAt: slot(6, '13:00'),
        participantIds: [ids.shared],
      }).expect(201);
      // moving into dd2's slot is blocked (equal priority)
      await http()
        .patch(`${API}/meetings/${own}`)
        .set(as('dd1'))
        .send({ startAt: slot(6, '12:30'), endAt: slot(6, '13:30') })
        .expect(409);
    });
  });

  // ---------------------------------------------------------------- race safety

  it('two parallel equal-priority creates for the same officer → exactly one 201 and one 409', async () => {
    const payload = (title: string) => ({
      title,
      startAt: slot(7, '10:00'),
      endAt: slot(7, '11:00'),
      participantIds: [ids.shared],
    });
    const results = await Promise.all([
      create('dd1', payload('সমান্তরাল এক')),
      create('dd2', payload('সমান্তরাল দুই')),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const saved = await ds.getRepository(Meeting).count({
      where: [{ title: 'সমান্তরাল এক' }, { title: 'সমান্তরাল দুই' }],
    });
    expect(saved).toBe(1);
  });

  // ---------------------------------------------------------------- permissions & visibility

  describe('visibility and permissions', () => {
    let meetingId: string;

    beforeAll(async () => {
      meetingId = body(
        await create('dd1', {
          title: 'অনুমতি পরীক্ষা',
          startAt: slot(8, '10:00'),
          endAt: slot(8, '11:00'),
          chairId: ids.director,
          participantIds: [ids.shared],
        }).expect(201),
      ).id;
    });

    it('people of the meeting and admins can read it; outsiders get 404', async () => {
      const detail = await http()
        .get(`${API}/meetings/${meetingId}`)
        .set(as('shared'))
        .expect(200);
      const detailBody = detail.body as {
        chair: { id: string };
        participants: Array<{
          id: string;
          role: ParticipantRole;
          wing?: { nameBn: string } | null;
        }>;
      };
      expect(detailBody.chair.id).toBe(ids.director);
      // Every person carries a wing field (null when the officer has no wing).
      expect(detailBody.participants.every((p) => p.wing !== undefined)).toBe(
        true,
      );
      const roles = Object.fromEntries(
        detailBody.participants.map((p) => [p.id, p.role]),
      );
      expect(roles).toEqual({
        [ids.dd1]: ParticipantRole.ORGANIZER,
        [ids.director]: ParticipantRole.CHAIR,
        [ids.shared]: ParticipantRole.MEMBER,
      });
      await http()
        .get(`${API}/meetings/${meetingId}`)
        .set(as('admin'))
        .expect(200);
      const res = await http()
        .get(`${API}/meetings/${meetingId}`)
        .set(as('outsider'))
        .expect(404);
      expect(body(res).message).toBe(MEETING_MESSAGES.notFound);
    });

    it('only the organizer or an admin may edit/cancel; invitees get 403, outsiders 404', async () => {
      await http()
        .patch(`${API}/meetings/${meetingId}`)
        .set(as('shared'))
        .send({ room: 'x' })
        .expect(403);
      await http()
        .patch(`${API}/meetings/${meetingId}`)
        .set(as('director'))
        .send({ room: 'x' })
        .expect(403); // chair is not organizer
      await http()
        .patch(`${API}/meetings/${meetingId}`)
        .set(as('outsider'))
        .send({ room: 'x' })
        .expect(404);
      await http()
        .post(`${API}/meetings/${meetingId}/cancel`)
        .set(as('shared'))
        .send({ reason: 'আমি চাই না' })
        .expect(403);
      const ok = await http()
        .patch(`${API}/meetings/${meetingId}`)
        .set(as('admin'))
        .send({ room: 'নতুন কক্ষ' })
        .expect(200);
      expect(ok.body).toMatchObject({
        room: 'নতুন কক্ষ',
        organizer: { id: ids.dd1 },
      });
    });

    it('only admins may hard-delete', async () => {
      const temp = body(
        await create('dd1', {
          title: 'মুছে ফেলার সভা',
          startAt: slot(8, '15:00'),
          endAt: slot(8, '16:00'),
        }).expect(201),
      ).id;
      await http().delete(`${API}/meetings/${temp}`).set(as('dd1')).expect(403);
      await http()
        .delete(`${API}/meetings/${temp}`)
        .set(as('admin'))
        .expect(204);
      expect(await ds.getRepository(Meeting).countBy({ id: temp })).toBe(0);
      expect(
        await ds.getRepository(MeetingParticipant).countBy({ meetingId: temp }),
      ).toBe(0);
    });

    it('SUPER_ADMIN cannot organize (403) or be invited (400)', async () => {
      const res = await create('superadmin', {
        title: 'সুপার সভা',
        startAt: slot(9, '10:00'),
        endAt: slot(9, '11:00'),
      }).expect(403);
      expect(body(res).message).toBe(MEETING_MESSAGES.superAdminOrganize);
      const invite = await create('dd1', {
        title: 'আমন্ত্রণ পরীক্ষা',
        startAt: slot(9, '10:00'),
        endAt: slot(9, '11:00'),
        participantIds: [ids.superadmin],
      }).expect(400);
      expect(body(invite).message).toBe(MEETING_MESSAGES.superAdminInvite);
    });

    it('scope=all is for admins only', async () => {
      await http()
        .get(`${API}/meetings`)
        .query({ scope: 'all' })
        .set(as('dd1'))
        .expect(403);
      const all = await http()
        .get(`${API}/meetings`)
        .query({ scope: 'all', limit: 100 })
        .set(as('admin'))
        .expect(200);
      expect((all.body as { total: number }).total).toBeGreaterThan(5);
    });
  });

  // ---------------------------------------------------------------- validation & snapshot

  describe('validation and the priority snapshot', () => {
    it.each([
      [
        'end before start',
        slot(10, '11:00'),
        slot(10, '10:00'),
        MEETING_MESSAGES.endBeforeStart,
      ],
      [
        'longer than 12 h',
        slot(10, '06:00'),
        slot(10, '18:30'),
        MEETING_MESSAGES.tooLong,
      ],
      [
        'in the past',
        slot(-1, '10:00'),
        slot(-1, '11:00'),
        MEETING_MESSAGES.inPast,
      ],
    ])('%s → 400', async (_label, startAt, endAt, message) => {
      const res = await create('dd1', {
        title: 'ভুল সময়',
        startAt,
        endAt,
      }).expect(400);
      expect(body(res).message).toContain(message);
    });

    it('times must carry an offset; links must be https; title 3–200', async () => {
      await create('dd1', {
        title: 'অফসেট নেই',
        startAt: '2030-01-01T10:00:00',
        endAt: '2030-01-01T11:00:00',
      }).expect(400);
      await create('dd1', {
        title: 'লিংক',
        startAt: slot(10, '10:00'),
        endAt: slot(10, '11:00'),
        onlineLink: 'http://x.test',
      }).expect(400);
      await create('dd1', {
        title: 'ab',
        startAt: slot(10, '10:00'),
        endAt: slot(10, '11:00'),
      }).expect(400);
    });

    it('priority is a snapshot: later designation changes do not touch the meeting', async () => {
      const id = body(
        await create('dd1', {
          title: 'স্ন্যাপশট',
          startAt: slot(11, '10:00'),
          endAt: slot(11, '11:00'),
        }).expect(201),
      ).id;
      await ds
        .getRepository(Designation)
        .update(designationIds['Deputy Director'], { priority: 2 });
      try {
        const meeting = await ds.getRepository(Meeting).findOneByOrFail({ id });
        expect(meeting.priority).toBe(6);
      } finally {
        await ds
          .getRepository(Designation)
          .update(designationIds['Deputy Director'], { priority: 6 });
      }
    });
  });

  // ---------------------------------------------------------------- today / complete / scheduler

  describe('today, complete and the auto-complete job', () => {
    async function insertMeeting(
      organizer: Who,
      startAt: Date,
      endAt: Date,
      title: string,
    ) {
      const id = (
        await ds.getRepository(Meeting).insert({
          title,
          startAt,
          endAt,
          organizerId: ids[organizer],
          priority: 7,
        })
      ).identifiers[0].id as string;
      await ds.getRepository(MeetingParticipant).insert({
        meetingId: id,
        userId: ids[organizer],
        role: ParticipantRole.ORGANIZER,
      });
      return id;
    }

    it('GET /meetings/today uses Asia/Dhaka day boundaries', async () => {
      const today = DateTime.now().setZone(ZONE).startOf('day');
      await insertMeeting(
        'outsider',
        today.plus({ minutes: 10 }).toJSDate(),
        today.plus({ minutes: 40 }).toJSDate(),
        'আজ ভোরে',
      );
      await insertMeeting(
        'outsider',
        today.minus({ minutes: 30 }).toJSDate(),
        today.minus({ minutes: 10 }).toJSDate(),
        'গতকাল রাতে',
      );
      await insertMeeting(
        'outsider',
        today.plus({ days: 1, minutes: 5 }).toJSDate(),
        today.plus({ days: 1, minutes: 30 }).toJSDate(),
        'আগামীকাল',
      );
      const res = await http()
        .get(`${API}/meetings/today`)
        .set(as('outsider'))
        .expect(200);
      expect(
        (res.body as Array<{ title: string }>).map((m) => m.title),
      ).toEqual(['আজ ভোরে']);
    });

    it('complete only after the start; then notes are saved', async () => {
      const future = body(
        await create('so', {
          title: 'ভবিষ্যৎ সভা',
          startAt: slot(12, '10:00'),
          endAt: slot(12, '11:00'),
        }).expect(201),
      ).id;
      await http()
        .post(`${API}/meetings/${future}/complete`)
        .set(as('so'))
        .send({})
        .expect(409);

      const past = await insertMeeting(
        'so',
        new Date(Date.now() - 2 * 3_600_000),
        new Date(Date.now() - 3_600_000),
        'শেষ হওয়া সভা',
      );
      await http()
        .patch(`${API}/meetings/${past}`)
        .set(as('so'))
        .send({ room: 'x' })
        .expect(409); // ended
      const done = await http()
        .post(`${API}/meetings/${past}/complete`)
        .set(as('so'))
        .send({ notes: 'সিদ্ধান্ত: প্রতিবেদন জমা দেওয়া হবে।' })
        .expect(200);
      expect(done.body).toMatchObject({
        status: 'COMPLETED',
        notes: 'সিদ্ধান্ত: প্রতিবেদন জমা দেওয়া হবে।',
      });
    });

    it('the scheduler completes meetings ended > 1 h ago and resolves their conflicts', async () => {
      const higher = await insertMeeting(
        'director',
        new Date(Date.now() - 4 * 3_600_000),
        new Date(Date.now() - 3 * 3_600_000),
        'পুরনো উচ্চ',
      );
      const lower = await insertMeeting(
        'so',
        new Date(Date.now() - 4 * 3_600_000),
        new Date(Date.now() - 3 * 3_600_000),
        'পুরনো নিম্ন',
      );
      const recent = await insertMeeting(
        'dd2',
        new Date(Date.now() - 60 * 60_000),
        new Date(Date.now() - 30 * 60_000),
        'সদ্য শেষ',
      );
      await ds.getRepository(MeetingConflict).insert({
        higherMeetingId: higher,
        lowerMeetingId: lower,
        userId: ids.so,
        status: ConflictStatus.PENDING,
      });

      const completed = await app.get(MeetingSchedulerService).autoComplete();
      expect(completed).toBeGreaterThanOrEqual(2);
      expect(
        (await ds.getRepository(Meeting).findOneByOrFail({ id: higher }))
          .status,
      ).toBe(MeetingStatus.COMPLETED);
      expect(
        (await ds.getRepository(Meeting).findOneByOrFail({ id: recent }))
          .status,
      ).toBe(MeetingStatus.SCHEDULED); // < 1 h
      expect(
        (
          await ds
            .getRepository(MeetingConflict)
            .findOneByOrFail({ higherMeetingId: higher })
        ).status,
      ).toBe(ConflictStatus.RESOLVED);
    });
  });
});
