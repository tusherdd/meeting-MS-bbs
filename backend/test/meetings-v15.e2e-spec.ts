/**
 * Release v1.5 e2e (SPEC.md §6.3, §6.4, §6.7) on the TEST database:
 * - the meeting priority comes from the internal chair (guest chair / no chair → organizer),
 *   recomputed when the chair changes on edit, with the chair notice and the audit entry;
 * - conflict notices are informational, to the lower organizer and each shared officer;
 * - guest officers: validation, mails (invite / update / cancel / removal), detail, reports,
 *   never part of the conflict check.
 * Own users, designations and days (40+), so it never touches the other e2e files.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DateTime } from 'luxon';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Like } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { hashPassword } from '../src/common/utils/password';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { AuditAction } from '../src/modules/audit/enums/audit-action.enum';
import { Designation } from '../src/modules/designations/entities/designation.entity';
import { EmailOutbox } from '../src/modules/mail/entities/email-outbox.entity';
import { MeetingConflict } from '../src/modules/meetings/entities/meeting-conflict.entity';
import { MeetingGuest } from '../src/modules/meetings/entities/meeting-guest.entity';
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
const DOMAIN = 'e2e-v15.test';
const GUEST_DOMAIN = 'guest-v15.test';

type Who = 'secretary' | 'director' | 'dd1' | 'dd2' | 'so' | 'so2' | 'shared';

function slot(day: number, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return DateTime.now()
    .setZone(ZONE)
    .startOf('day')
    .plus({ days: day })
    .set({ hour: h, minute: m })
    .toISO({ suppressMilliseconds: true })!;
}

interface Detail {
  id: string;
  priority: number;
  chair: { id: string } | null;
  guests: Array<{
    name: string;
    designation: string;
    email: string;
    isChair: boolean;
  }>;
  message?: string | string[];
}

const guest = (local: string, isChair?: boolean) => ({
  name: `অতিথি ${local}`,
  designation: 'যুগ্মসচিব, পরিকল্পনা মন্ত্রণালয়',
  email: `${local}@${GUEST_DOMAIN}`,
  ...(isChair !== undefined ? { isChair } : {}),
});

describe('v1.5: chair priority, informational conflicts, guest officers (e2e)', () => {
  let app: INestApplication<App>;
  let ds: DataSource;
  const ids = {} as Record<Who, string>;
  const tokens = {} as Record<Who, string>;

  const http = () => request(app.getHttpServer());
  const as = (who: Who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const create = (who: Who, payload: Record<string, unknown>) =>
    // v1.9: a venue is required; tests that check that send `room` themselves.
    http()
      .post(`${API}/meetings`)
      .set(as(who))
      .send({ room: 'সম্মেলন কক্ষ', ...payload });
  const patch = (who: Who, id: string, payload: Record<string, unknown>) =>
    http().patch(`${API}/meetings/${id}`).set(as(who)).send(payload);
  const detail = (res: request.Response) => res.body as Detail;
  const notificationsOf = (who: Who, type: NotificationType) =>
    ds
      .getRepository(Notification)
      .find({ where: { userId: ids[who], type }, order: { createdAt: 'ASC' } });
  const mailsTo = (local: string) =>
    ds.getRepository(EmailOutbox).find({
      where: { to: `${local}@${GUEST_DOMAIN}` },
      order: { createdAt: 'ASC' },
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
      ['V15 Secretary', 'সচিব', 1],
      ['V15 Director', 'পরিচালক', 4],
      ['V15 Deputy Director', 'উপপরিচালক', 6],
      ['V15 Statistical Officer', 'পরিসংখ্যান কর্মকর্তা', 7],
    ] as const) {
      designationIds[nameEn] = (
        await ds
          .getRepository(Designation)
          .insert({ nameBn: `${nameBn} (v1.5)`, nameEn, priority })
      ).identifiers[0].id as string;
    }
    const passwordHash = await hashPassword(PASSWORD);
    const people: Array<[Who, string, string]> = [
      ['secretary', 'V15 Secretary', 'সচিব মহোদয়'],
      ['director', 'V15 Director', 'পরিচালক মহোদয়'],
      ['dd1', 'V15 Deputy Director', 'উপপরিচালক এক'],
      ['dd2', 'V15 Deputy Director', 'উপপরিচালক দুই'],
      ['so', 'V15 Statistical Officer', 'পরিসংখ্যান কর্মকর্তা এক'],
      ['so2', 'V15 Statistical Officer', 'পরিসংখ্যান কর্মকর্তা দুই'],
      ['shared', 'V15 Statistical Officer', 'যৌথ কর্মকর্তা'],
    ];
    for (const [who, designation, nameBn] of people) {
      ids[who] = (
        await ds.getRepository(User).insert({
          loginEmail: `${who}@${DOMAIN}`,
          notificationEmail: `${who}@${DOMAIN}`,
          passwordHash,
          nameBn,
          nameEn: `V15 ${who}`,
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

  // ---------------------------------------------------------------- priority from the chair

  describe('priority comes from the chair', () => {
    it('internal chair → chair priority; the chair gets a separate notice; audit entry', async () => {
      const res = await create('dd1', {
        title: 'সভাপতির অগ্রাধিকার',
        startAt: slot(40, '10:00'),
        endAt: slot(40, '11:00'),
        chairId: ids.secretary,
      }).expect(201);
      const m = detail(res);
      expect(m.priority).toBe(1); // the secretary's, not the organizer's 6
      expect(m.chair?.id).toBe(ids.secretary);

      const notices = await notificationsOf(
        'secretary',
        NotificationType.MEETING_CHAIR_ASSIGNED,
      );
      expect(notices).toHaveLength(1);
      expect(notices[0].body).toContain(
        'আপনাকে “সভাপতির অগ্রাধিকার” সভার সভাপতি করা হয়েছে, তাই সভাটি আপনার পদবির অগ্রাধিকার পেয়েছে।',
      );
      expect(notices[0].body).not.toMatch(/অগ্রাধিকার\s*[০-৯0-9]/); // no priority number
      // The invitation is a separate notice; e-mail copies went to the outbox.
      expect(
        await notificationsOf('secretary', NotificationType.MEETING_INVITED),
      ).toHaveLength(1);
      expect(
        await ds.getRepository(EmailOutbox).countBy({
          to: `secretary@${DOMAIN}`,
          subject: 'সভাপতি: সভাপতির অগ্রাধিকার',
        }),
      ).toBe(1);

      const audit = await ds.getRepository(AuditLog).findOneByOrFail({
        action: AuditAction.MEETING_CHAIR_PRIORITY_APPLIED,
        entityId: m.id,
      });
      expect(audit).toMatchObject({
        actorId: ids.dd1,
        entityType: 'meeting',
        before: { priority: 6 },
        after: { chairId: ids.secretary, priority: 1 },
      });
    });

    it('a lower-ranked internal chair lowers the priority too (the rule is "the chair\'s")', async () => {
      const m = detail(
        await create('dd1', {
          title: 'নিম্ন সভাপতি',
          startAt: slot(40, '12:00'),
          endAt: slot(40, '13:00'),
          chairId: ids.so,
        }).expect(201),
      );
      expect(m.priority).toBe(7);
    });

    it('no chair or the organizer as chair → organizer priority, no chair notice', async () => {
      const none = detail(
        await create('dd2', {
          title: 'সভাপতি নেই',
          startAt: slot(40, '14:00'),
          endAt: slot(40, '15:00'),
        }).expect(201),
      );
      expect(none.priority).toBe(6);
      const self = detail(
        await create('dd2', {
          title: 'নিজেই সভাপতি',
          startAt: slot(40, '16:00'),
          endAt: slot(40, '17:00'),
          chairId: ids.dd2,
        }).expect(201),
      );
      expect(self.priority).toBe(6);
      expect(
        await notificationsOf('dd2', NotificationType.MEETING_CHAIR_ASSIGNED),
      ).toHaveLength(0);
      expect(
        await ds.getRepository(AuditLog).countBy({
          action: AuditAction.MEETING_CHAIR_PRIORITY_APPLIED,
          entityId: self.id,
        }),
      ).toBe(0);
    });

    it('guest chair → organizer priority', async () => {
      const m = detail(
        await create('dd1', {
          title: 'অতিথি সভাপতি',
          startAt: slot(40, '18:00'),
          endAt: slot(40, '19:00'),
          guests: [guest('chair40', true)],
        }).expect(201),
      );
      expect(m.priority).toBe(6);
      expect(m.chair).toBeNull();
      expect(m.guests).toEqual([
        expect.objectContaining({
          email: `chair40@${GUEST_DOMAIN}`,
          isChair: true,
        }),
      ]);
    });

    it('chair change on edit recomputes the priority and re-runs the check (both directions)', async () => {
      // A: Director (4) with the shared officer.
      const a = detail(
        await create('director', {
          title: 'পরিচালকের সভা',
          startAt: slot(41, '10:00'),
          endAt: slot(41, '11:00'),
          participantIds: [ids.shared],
        }).expect(201),
      );
      // B: Deputy Director (6) with the shared officer at the same time → blocked (6 ≥ 4).
      await create('dd1', {
        title: 'উপপরিচালকের সভা',
        startAt: slot(41, '10:00'),
        endAt: slot(41, '11:00'),
        participantIds: [ids.shared, ids.secretary],
      }).expect(409);
      // Without the shared officer it is saved (priority 6).
      const b = detail(
        await create('dd1', {
          title: 'উপপরিচালকের সভা',
          startAt: slot(41, '10:00'),
          endAt: slot(41, '11:00'),
          participantIds: [ids.secretary],
        }).expect(201),
      );
      expect(b.priority).toBe(6);

      // Edit: the secretary becomes chair and the shared officer joins → priority 1 → allowed.
      const up = detail(
        await patch('dd1', b.id, {
          chairId: ids.secretary,
          participantIds: [ids.secretary, ids.shared],
        }).expect(200),
      );
      expect(up.priority).toBe(1);
      const conflict = await ds.getRepository(MeetingConflict).findOneByOrFail({
        higherMeetingId: b.id,
        lowerMeetingId: a.id,
      });
      expect(conflict).toMatchObject({
        userId: ids.shared,
        status: ConflictStatus.PENDING,
      });
      expect(
        await ds.getRepository(AuditLog).findOneByOrFail({
          action: AuditAction.MEETING_CHAIR_PRIORITY_APPLIED,
          entityId: b.id,
        }),
      ).toMatchObject({
        before: { priority: 6 },
        after: { chairId: ids.secretary, priority: 1 },
      });
      expect(
        await notificationsOf(
          'secretary',
          NotificationType.MEETING_CHAIR_ASSIGNED,
        ),
      ).toHaveLength(2); // this one and the first test's

      // Edit: chair removed (the secretary stays a member) → back to 6 → blocked by A (4).
      const res = await patch('dd1', b.id, { chairId: null }).expect(409);
      expect((res.body as { message: string }).message).toBe(
        MEETING_MESSAGES.blocking,
      );
      expect(
        (await ds.getRepository(Meeting).findOneByOrFail({ id: b.id }))
          .priority,
      ).toBe(1); // nothing saved
    });

    it('a chair change alone (no new people, no new time) re-runs the check', async () => {
      // A: Statistical Officer (7) with the shared officer. B: Deputy Director (6) overrides it.
      const a = detail(
        await create('so', {
          title: 'পরিসংখ্যান সভা',
          startAt: slot(42, '10:00'),
          endAt: slot(42, '11:00'),
          participantIds: [ids.shared],
        }).expect(201),
      );
      const b = detail(
        await create('dd2', {
          title: 'উপপরিচালক দুইয়ের সভা',
          startAt: slot(42, '10:00'),
          endAt: slot(42, '11:00'),
          participantIds: [ids.shared, ids.so2],
        }).expect(201),
      );
      expect(b.priority).toBe(6);
      // so2 (already a member, priority 7) becomes chair → 7 ≥ 7 → blocked.
      await patch('dd2', b.id, { chairId: ids.so2 }).expect(409);

      // The other way: A's chair becomes the director (4) → A outranks B (6): a new conflict
      // A > B, and the old B > A conflict resolves because B is no longer higher.
      const old = await ds.getRepository(MeetingConflict).findOneByOrFail({
        higherMeetingId: b.id,
        lowerMeetingId: a.id,
      });
      expect(old.status).toBe(ConflictStatus.PENDING);
      const upA = detail(
        await patch('so', a.id, {
          chairId: ids.director,
          participantIds: [ids.shared],
        }).expect(200),
      );
      expect(upA.priority).toBe(4);
      expect(
        (
          await ds
            .getRepository(MeetingConflict)
            .findOneByOrFail({ id: old.id })
        ).status,
      ).toBe(ConflictStatus.RESOLVED);
      expect(
        await ds.getRepository(MeetingConflict).findOneByOrFail({
          higherMeetingId: a.id,
          lowerMeetingId: b.id,
        }),
      ).toMatchObject({ status: ConflictStatus.PENDING, userId: ids.shared });
    });

    it('check-conflicts uses the same chair rule', async () => {
      await create('director', {
        title: 'পরিচালকের সভা ৪৫',
        startAt: slot(45, '10:00'),
        endAt: slot(45, '11:00'),
        participantIds: [ids.shared],
      }).expect(201);
      const base = {
        title: 'যাচাই',
        startAt: slot(45, '10:30'),
        endAt: slot(45, '11:30'),
        participantIds: [ids.shared, ids.secretary],
      };
      const dryRun = (payload: Record<string, unknown>) =>
        http()
          .post(`${API}/meetings/check-conflicts`)
          .set(as('dd1'))
          .send(payload)
          .expect(200);
      // dd1 (6) vs the director (4): blocked; with the secretary (1) as chair: allowed.
      expect(((await dryRun(base)).body as { allowed: boolean }).allowed).toBe(
        false,
      );
      const withChair = await dryRun({ ...base, chairId: ids.secretary });
      expect(withChair.body).toMatchObject({ allowed: true, blocking: [] });
      expect(
        (withChair.body as { willNotify: unknown[] }).willNotify,
      ).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------- informational conflict notice

  describe('conflict notice is informational', () => {
    it('the lower organizer and each shared officer get the same notice once; no cancel request', async () => {
      const lower = detail(
        await create('so', {
          title: 'নিম্ন সভা ৪৩',
          startAt: slot(43, '10:00'),
          endAt: slot(43, '11:00'),
          participantIds: [ids.shared, ids.so2],
        }).expect(201),
      );
      // Organized by dd1, chaired by the secretary: the designation in the text is the chair's.
      await create('dd1', {
        title: 'উচ্চ সভা ৪৩',
        startAt: slot(43, '10:30'),
        endAt: slot(43, '11:30'),
        chairId: ids.secretary,
        participantIds: [ids.shared, ids.so],
      }).expect(201);

      const byTitle = (rows: Notification[]) =>
        rows.filter((n) => n.title === 'সময় কনফ্লিক্ট: নিম্ন সভা ৪৩');
      // so organizes the lower meeting AND is a shared officer: one notice only.
      const toOrganizer = byTitle(
        await notificationsOf('so', NotificationType.MEETING_CONFLICT),
      );
      expect(toOrganizer).toHaveLength(1);
      expect(toOrganizer[0].body).toContain(
        'সময় কনফ্লিক্ট: একই সময়ে আপনার ও যৌথ কর্মকর্তা-এর সচিব (v1.5) মহোদয়ের সাথে আরেকটি সভা (“উচ্চ সভা ৪৩”) আছে',
      );
      expect(toOrganizer[0].body).toContain(
        'আপনি চাইলে আপনার সভা “নিম্ন সভা ৪৩” বাতিল করতে পারেন অথবা অন্য সিদ্ধান্ত নিতে পারেন।',
      );
      expect(toOrganizer[0].link).toBe(`/meetings/${lower.id}`);

      const toShared = byTitle(
        await notificationsOf('shared', NotificationType.MEETING_CONFLICT),
      );
      expect(toShared).toHaveLength(1);
      expect(toShared[0].body).toContain(
        'একই সময়ে আপনার ও পরিসংখ্যান কর্মকর্তা এক-এর সচিব (v1.5) মহোদয়ের',
      );

      // so2 is only in the lower meeting: not shared, not notified.
      expect(
        byTitle(
          await notificationsOf('so2', NotificationType.MEETING_CONFLICT),
        ),
      ).toHaveLength(0);

      for (const n of [...toOrganizer, ...toShared]) {
        expect(n.body).not.toMatch(/অনুগ্রহ করে|পুনঃনির্ধারণ করুন/);
      }
      // The conflict stays PENDING until it resolves by itself.
      const conflicts = await ds
        .getRepository(MeetingConflict)
        .findBy({ lowerMeetingId: lower.id });
      expect(conflicts).toHaveLength(2);
      expect(conflicts.every((c) => c.status === ConflictStatus.PENDING)).toBe(
        true,
      );
    });
  });

  // ---------------------------------------------------------------- guest officers

  describe('guest officers', () => {
    let meetingId: string;

    it('validates name, designation and email', async () => {
      const base = {
        title: 'অতিথি যাচাই',
        startAt: slot(44, '10:00'),
        endAt: slot(44, '11:00'),
      };
      for (const bad of [
        { designation: 'পদ', email: `x@${GUEST_DOMAIN}` },
        { name: 'নাম', email: `x@${GUEST_DOMAIN}` },
        { name: 'নাম', designation: 'পদ' },
        { name: 'নাম', designation: 'পদ', email: 'not-an-email' },
        { name: '   ', designation: 'পদ', email: `x@${GUEST_DOMAIN}` },
        {
          name: 'নাম',
          designation: 'পদ',
          email: `x@${GUEST_DOMAIN}`,
          extra: 1,
        },
      ]) {
        await create('dd1', { ...base, guests: [bad] }).expect(400);
      }
      const many = Array.from({ length: 51 }, (_, i) => guest(`many${i}`));
      const tooMany = await create('dd1', { ...base, guests: many }).expect(
        400,
      );
      expect(JSON.stringify(tooMany.body)).toContain(
        'সর্বোচ্চ ৫০ জন অতিথি কর্মকর্তা',
      );

      const dup = await create('dd1', {
        ...base,
        guests: [
          guest('same'),
          { ...guest('other'), email: `SAME@${GUEST_DOMAIN}` },
        ],
      }).expect(400);
      expect((dup.body as { message: string }).message).toBe(
        MEETING_MESSAGES.guestDuplicateEmail(`same@${GUEST_DOMAIN}`),
      );

      const officer = await create('dd1', {
        ...base,
        guests: [{ ...guest('o'), email: `Shared@${DOMAIN}` }],
      }).expect(400);
      expect((officer.body as { message: string }).message).toBe(
        MEETING_MESSAGES.guestIsOfficer(`shared@${DOMAIN}`, 'যৌথ কর্মকর্তা'),
      );

      const twoChairs = await create('dd1', {
        ...base,
        chairId: ids.director,
        guests: [guest('c', true)],
      }).expect(400);
      expect((twoChairs.body as { message: string }).message).toBe(
        MEETING_MESSAGES.oneChair,
      );
      await create('dd1', {
        ...base,
        guests: [guest('c1', true), guest('c2', true)],
      }).expect(400);
      expect(
        await ds.getRepository(Meeting).countBy({ title: 'অতিথি যাচাই' }),
      ).toBe(0);
    });

    it('create: guests are saved (trimmed, email lowercased) and get an invitation mail with every detail', async () => {
      const res = await create('dd1', {
        title: 'অতিথিসহ সভা',
        agenda: '১. বাজেট\n২. বিবিধ',
        startAt: slot(44, '10:00'),
        endAt: slot(44, '11:00'),
        room: 'কক্ষ ৫০১',
        onlineLink: 'https://meet.example.org/v15',
        participantIds: [ids.shared],
        guests: [
          {
            ...guest('ga', true),
            name: '  অতিথি   ga ',
            email: ` GA@${GUEST_DOMAIN} `,
          },
          guest('gb'),
        ],
      }).expect(201);
      const m = detail(res);
      meetingId = m.id;
      expect(m.guests).toEqual([
        expect.objectContaining({
          name: 'অতিথি ga',
          email: `ga@${GUEST_DOMAIN}`,
          isChair: true,
        }),
        expect.objectContaining({
          email: `gb@${GUEST_DOMAIN}`,
          isChair: false,
        }),
      ]);

      const [invite] = await mailsTo('ga');
      expect(invite.subject).toBe('সভার আমন্ত্রণ: অতিথিসহ সভা');
      for (const part of [
        'প্রিয় অতিথি ga',
        'অতিথি কর্মকর্তা হিসেবে',
        'শিরোনাম: অতিথিসহ সভা',
        'স্থান: কক্ষ ৫০১',
        'Online Link: https://meet.example.org/v15',
        // v1.9: the organizer is shown as the wing; this one has none → the designation.
        'আয়োজক: উপপরিচালক (v1.5)',
        'সভাপতি: অতিথি ga, যুগ্মসচিব, পরিকল্পনা মন্ত্রণালয় (অতিথি কর্মকর্তা)',
        '১. বাজেট',
      ]) {
        expect(invite.text).toContain(part);
      }
      expect(invite.text).not.toMatch(/\/meetings\/|\/login|Password/);
      expect(await mailsTo('gb')).toHaveLength(1);
      // Guests have no bell and no account.
      expect(
        await ds
          .getRepository(User)
          .countBy({ loginEmail: Like(`%@${GUEST_DOMAIN}`) }),
      ).toBe(0);
    });

    it('guests are not part of the conflict check', async () => {
      // dd2 (6, equal priority) at the same time with the same guest but no shared officer → fine.
      const res = await create('dd2', {
        title: 'একই অতিথি',
        startAt: slot(44, '10:00'),
        endAt: slot(44, '11:00'),
        guests: [guest('gb')],
      }).expect(201);
      expect(
        await ds.getRepository(MeetingConflict).countBy({
          lowerMeetingId: detail(res).id,
        }),
      ).toBe(0);
      expect(
        await ds.getRepository(MeetingConflict).countBy({
          higherMeetingId: detail(res).id,
        }),
      ).toBe(0);
    });

    it('update: changes mailed to kept guests, removal and invitation mails, removed guest chair → no chair', async () => {
      await patch('dd1', meetingId, {
        room: 'সম্মেলন কক্ষ',
        agenda: '১. নতুন আলোচ্যসূচি',
        guests: [guest('gb'), guest('gc')], // ga (the chair) removed, gc added
      }).expect(200);
      const m = detail(
        await http()
          .get(`${API}/meetings/${meetingId}`)
          .set(as('dd1'))
          .expect(200),
      );
      expect(m.chair).toBeNull();
      expect(m.guests.map((g) => [g.email, g.isChair])).toEqual([
        [`gb@${GUEST_DOMAIN}`, false],
        [`gc@${GUEST_DOMAIN}`, false],
      ]);

      const ga = await mailsTo('ga');
      expect(ga.at(-1)!.subject).toBe(
        'অতিথি কর্মকর্তার তালিকা থেকে বাদ: অতিথিসহ সভা',
      );
      const gc = await mailsTo('gc');
      expect(gc.map((x) => x.subject)).toEqual(['সভার আমন্ত্রণ: অতিথিসহ সভা']);
      const gb = (await mailsTo('gb')).filter((x) =>
        x.subject.startsWith('সভায় পরিবর্তন: অতিথিসহ সভা'),
      );
      expect(gb).toHaveLength(1);
      expect(gb[0].text).toContain('স্থান: কক্ষ ৫০১ → সম্মেলন কক্ষ');
      expect(gb[0].text).toContain('আলোচ্যসূচি: হালনাগাদ করা হয়েছে');
      expect(gb[0].text).toContain('১. নতুন আলোচ্যসূচি');
    });

    it('an officer chair set without sending guests clears the guest chair (one chair in total)', async () => {
      await patch('dd1', meetingId, {
        guests: [guest('gb', true), guest('gc')],
      }).expect(200);
      const m = detail(
        await patch('dd1', meetingId, { chairId: ids.director }).expect(200),
      );
      expect(m.chair?.id).toBe(ids.director);
      expect(m.priority).toBe(4);
      expect(m.guests.every((g) => !g.isChair)).toBe(true);
      // Both at once in one request → 400.
      await patch('dd1', meetingId, {
        chairId: ids.director,
        guests: [guest('gb', true)],
      }).expect(400);
    });

    it('the database refuses an officer chair and a guest chair on one meeting', async () => {
      await expect(
        ds.transaction(async (manager) => {
          await manager
            .getRepository(MeetingGuest)
            .update(
              { meetingId, email: `gb@${GUEST_DOMAIN}` },
              { isChair: true },
            );
        }),
      ).rejects.toThrow(/both an officer chair and a guest chair/);
    });

    it('reports list the guests under the meeting and do not count them', async () => {
      const date = DateTime.now().setZone(ZONE).plus({ days: 44 }).toISODate();
      const res = await http()
        .get(`${API}/reports/me`)
        .query({ period: 'day', date })
        .set(as('dd1'))
        .expect(200);
      const report = res.body as {
        summary: { totalMeetings: number; organized: number; attended: number };
        meetings: {
          items: Array<{
            id: string;
            chairNameBn: string | null;
            guests: Array<{ name: string; designation: string }>;
          }>;
        };
      };
      expect(report.summary).toMatchObject({
        totalMeetings: 1,
        organized: 1,
        attended: 0,
      });
      const item = report.meetings.items.find((i) => i.id === meetingId)!;
      expect(item.chairNameBn).toBe('পরিচালক মহোদয়');
      expect(item.guests).toEqual([
        { name: 'অতিথি gb', designation: 'যুগ্মসচিব, পরিকল্পনা মন্ত্রণালয়' },
        { name: 'অতিথি gc', designation: 'যুগ্মসচিব, পরিকল্পনা মন্ত্রণালয়' },
      ]);
      // A guest chair shows its name in the chair field.
      const date40 = DateTime.now()
        .setZone(ZONE)
        .plus({ days: 40 })
        .toISODate();
      const r20 = await http()
        .get(`${API}/reports/me`)
        .query({ period: 'day', date: date40 })
        .set(as('dd1'))
        .expect(200);
      const guestChaired = (r20.body as typeof report).meetings.items.find(
        (i) => i.guests.length > 0,
      )!;
      expect(guestChaired.chairNameBn).toBe('অতিথি chair40');
    });

    it('cancel: every guest gets a cancellation mail with the reason', async () => {
      await http()
        .post(`${API}/meetings/${meetingId}/cancel`)
        .set(as('dd1'))
        .send({ reason: 'জরুরি কারণে স্থগিত' })
        .expect(200);
      for (const local of ['gb', 'gc']) {
        const last = (await mailsTo(local)).at(-1)!;
        expect(last.subject).toBe('সভা বাতিল: অতিথিসহ সভা');
        expect(last.text).toContain('বাতিলের কারণ: জরুরি কারণে স্থগিত');
      }
      expect((await mailsTo('ga')).at(-1)!.subject).not.toMatch(/বাতিল/); // removed earlier
    });
  });
});
