import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuthUser } from '../../common/types/auth-user';
import type { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import type {
  ConflictEngineService,
  LoadedMeeting,
} from './conflict-engine.service';
import type { MeetingDetailDto } from './dto/meeting-response.dto';
import { MeetingConflict } from './entities/meeting-conflict.entity';
import { MeetingGuest } from './entities/meeting-guest.entity';
import { MeetingParticipant } from './entities/meeting-participant.entity';
import { Meeting } from './entities/meeting.entity';
import { MeetingStatus } from './enums/meeting-status.enum';
import { ParticipantRole } from './enums/participant-role.enum';
import type { MeetingNotifierService } from './meeting-notifier.service';
import type { Clash } from './meeting-rules';
import { MEETING_MESSAGES } from './meetings.messages';
import { MeetingsService } from './meetings.service';

const secretary: AuthUser = {
  id: 'secretary',
  role: UserRole.OFFICER,
  mustChangePassword: false,
};

function loaded(
  id: string,
  priority: number,
  peopleIds: string[],
): LoadedMeeting {
  return {
    id,
    priority,
    peopleIds,
    status: MeetingStatus.SCHEDULED,
    startAt: new Date('2030-01-01T04:00:00Z'),
    endAt: new Date('2030-01-01T05:00:00Z'),
    title: `meeting ${id}`,
    organizerId: `${id}-organizer`,
    chairId: null,
    leadDesignationBn: 'উপপরিচালক',
    organizerNameBn: 'আয়োজক',
    organizerNameEn: 'Organizer',
    organizerDesignationBn: 'উপপরিচালক',
    organizerDesignationEn: 'Deputy Director',
    organizerWingBn: 'কম্পিউটার উইং',
    organizerWingEn: 'Computer Wing',
  };
}

function setup(classification: {
  warnings: Clash<LoadedMeeting>[];
  blocking: Clash<LoadedMeeting>[];
}) {
  const user = (id: string, nameBn: string, nameEn: string, priority: number) =>
    Object.assign(new User(), {
      id,
      role: UserRole.OFFICER,
      nameBn,
      designation: { nameBn, nameEn, priority },
    });
  const users: Record<string, User> = {
    secretary: user('secretary', 'সচিব', 'Secretary', 1),
    chair: user('chair', 'পরিচালক', 'Director', 4),
  };
  const userRepo = {
    findOneOrFail: jest.fn((options: { where: { id: string } }) =>
      Promise.resolve(users[options.where.id]),
    ),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn((options: { where: { id: { value: string[] } } }) =>
      Promise.resolve(
        options.where.id.value.map((id) => ({
          id,
          isActive: true,
          role: UserRole.OFFICER,
          designationId: 'd',
          nameBn: `নাম ${id}`,
          nameEn: `Name ${id}`,
        })),
      ),
    ),
  };
  const meetingRepo = {
    create: jest.fn((m: Partial<Meeting>) => m),
    save: jest.fn((m: Partial<Meeting>) =>
      Promise.resolve({ ...m, id: 'new-meeting' }),
    ),
  };
  const participantRepo = { insert: jest.fn() };
  const guestRepo = {
    insert: jest.fn(),
    findBy: jest.fn().mockResolvedValue([]),
  };
  const conflictRepo = {
    find: jest.fn().mockResolvedValue([]),
    insert: jest.fn((rows: unknown[]) =>
      Promise.resolve({ identifiers: rows.map((_, i) => ({ id: `c${i}` })) }),
    ),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === User
        ? userRepo
        : entity === Meeting
          ? meetingRepo
          : entity === MeetingParticipant
            ? participantRepo
            : entity === MeetingConflict
              ? conflictRepo
              : entity === MeetingGuest
                ? guestRepo
                : {},
    ),
  };
  const dataSource = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
      Promise.resolve().then(() => cb(manager as unknown as EntityManager)),
    ),
  };
  const engine = {
    lockPeople: jest.fn(),
    evaluate: jest.fn().mockResolvedValue(classification),
    resolveStale: jest.fn().mockResolvedValue([]),
  };
  const notifier = {
    invited: jest.fn(),
    conflict: jest.fn(),
    updated: jest.fn(),
    removed: jest.fn(),
    cancelled: jest.fn(),
    chairAssigned: jest.fn(),
    guests: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const service = new MeetingsService(
    {} as unknown as Repository<Meeting>,
    engine as unknown as ConflictEngineService,
    notifier as unknown as MeetingNotifierService,
    audit as unknown as AuditService,
    dataSource as unknown as DataSource,
  );
  jest
    .spyOn(service, 'findOne')
    .mockResolvedValue({ id: 'new-meeting' } as MeetingDetailDto);
  return {
    service,
    engine,
    notifier,
    audit,
    meetingRepo,
    participantRepo,
    conflictRepo,
    userRepo,
    guestRepo,
  };
}

const dto = {
  title: 'জরুরি সমন্বয় সভা',
  startAt: '2030-01-01T10:30:00+06:00',
  endAt: '2030-01-01T11:30:00+06:00',
  room: 'সম্মেলন কক্ষ (কক্ষ নং ৫০১)',
  chairId: 'chair' as string | null,
  participantIds: ['shared', 'secretary'],
};
const noClash = { warnings: [], blocking: [] };

describe('MeetingsService.create', () => {
  it('higher priority → saved (warning), conflict rows per shared officer, notifications', async () => {
    const lower = loaded('E', 7, ['E-organizer', 'shared']);
    const {
      service,
      engine,
      meetingRepo,
      participantRepo,
      conflictRepo,
      notifier,
    } = setup({
      warnings: [{ meeting: lower, sharedPeopleIds: ['shared'] }],
      blocking: [],
    });

    await service.create(secretary, dto, null);

    // people = organizer ∪ chair ∪ participants; locked before checking
    expect(engine.lockPeople).toHaveBeenCalledWith(expect.anything(), [
      'secretary',
      'chair',
      'shared',
    ]);
    expect(engine.evaluate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        priority: 4, // v1.5: the internal chair's priority (Director), not the organizer's
        organizerId: 'secretary',
        peopleIds: ['secretary', 'chair', 'shared'],
      }),
    );
    expect(meetingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: 4,
        organizerId: 'secretary',
        chairId: 'chair',
      }),
    );
    expect(participantRepo.insert).toHaveBeenCalledWith([
      {
        meetingId: 'new-meeting',
        userId: 'secretary',
        role: ParticipantRole.ORGANIZER,
      },
      {
        meetingId: 'new-meeting',
        userId: 'chair',
        role: ParticipantRole.CHAIR,
      },
      {
        meetingId: 'new-meeting',
        userId: 'shared',
        role: ParticipantRole.MEMBER,
      },
    ]);
    expect(conflictRepo.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        higherMeetingId: 'new-meeting',
        lowerMeetingId: 'E',
        userId: 'shared',
        status: 'PENDING',
      }),
    ]);
    // E's organizer + the shared officer are informed (v1.5: not a cancel request)
    // E's (lower) organizer + the shared officer are informed (v1.5: not a cancel request)
    expect(notifier.conflict).toHaveBeenCalledTimes(1);
    expect(notifier.conflict).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 'new-meeting',
        organizerId: 'secretary',
        leadDesignationBn: 'পরিচালক', // the chair's designation
        peopleIds: new Set(['secretary', 'chair', 'shared']),
      }),
      expect.objectContaining({ id: 'E', organizerId: 'E-organizer' }),
      [{ id: 'shared', nameBn: 'নাম shared' }],
      ['E-organizer', 'shared'],
    );
    expect(notifier.invited).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ['chair', 'shared'],
    );
  });

  it('mixed case (one warning + one organizer clash) → 409 and NOTHING is saved', async () => {
    const { service, meetingRepo, participantRepo, conflictRepo, notifier } =
      setup({
        warnings: [
          {
            meeting: loaded('LOWER', 7, ['shared']),
            sharedPeopleIds: ['shared'],
          },
        ],
        blocking: [
          {
            meeting: loaded('EQUAL', 4, ['shared']),
            sharedPeopleIds: ['shared'],
          },
        ],
      });

    const err = await service
      .create(secretary, dto, null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      message: MEETING_MESSAGES.blocking,
      blocking: [
        expect.objectContaining({
          meetingId: 'EQUAL',
          title: MEETING_MESSAGES.hiddenTitle, // secretary is not one of EQUAL's people
          sharedOfficers: [
            { id: 'shared', nameBn: 'নাম shared', nameEn: 'Name shared' },
          ],
        }),
      ],
    });
    expect(meetingRepo.save).not.toHaveBeenCalled();
    expect(participantRepo.insert).not.toHaveBeenCalled();
    expect(conflictRepo.insert).not.toHaveBeenCalled();
    expect(notifier.invited).not.toHaveBeenCalled();
    expect(notifier.conflict).not.toHaveBeenCalled();
  });

  it('no clash → saved without conflict rows', async () => {
    const { service, conflictRepo, meetingRepo } = setup({
      warnings: [],
      blocking: [],
    });
    await service.create(secretary, dto, null);
    expect(meetingRepo.save).toHaveBeenCalled();
    expect(conflictRepo.insert).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN cannot organize', async () => {
    const { service, userRepo, meetingRepo } = setup({
      warnings: [],
      blocking: [],
    });
    userRepo.findOneOrFail.mockResolvedValue(
      Object.assign(new User(), {
        id: 'sa',
        role: UserRole.SUPER_ADMIN,
        designation: null,
      }),
    );
    await expect(service.create(secretary, dto, null)).rejects.toThrow(
      new ForbiddenException(MEETING_MESSAGES.superAdminOrganize),
    );
    expect(meetingRepo.save).not.toHaveBeenCalled();
  });
});

describe('MeetingsService.create: v1.12 warn, do not block (SPEC.md §6.4)', () => {
  /** N is led by the chair (Director, priority 4). */
  const clashWith = (priority: number, shared = ['shared']) => ({
    meeting: loaded('E', priority, ['E-organizer', ...shared]),
    sharedPeopleIds: shared,
  });

  it('organizer rule: 409 with the new message (organizer-organizer / organizer-chair)', async () => {
    const own = loaded('OWN', 9, ['secretary']);
    const { service, meetingRepo, notifier } = setup({
      warnings: [],
      blocking: [{ meeting: own, sharedPeopleIds: ['secretary'] }],
    });
    const err = await service
      .create(secretary, dto, null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      message: 'আয়োজক একই সময়ে আরেকটি সভার আয়োজক বা সভাপতি।',
      blocking: [expect.objectContaining({ meetingId: 'OWN' })],
    });
    expect(meetingRepo.save).not.toHaveBeenCalled();
    expect(notifier.conflict).not.toHaveBeenCalled();
  });

  it.each([1, 4, 9])(
    'officer overlap with an E of priority %i → saved, PENDING record',
    async (ePriority) => {
      const { service, meetingRepo, conflictRepo } = setup({
        warnings: [clashWith(ePriority)],
        blocking: [],
      });
      await service.create(secretary, dto, null);
      expect(meetingRepo.save).toHaveBeenCalled();
      expect(conflictRepo.insert).toHaveBeenCalledWith([
        expect.objectContaining({ userId: 'shared', status: 'PENDING' }),
      ]);
    },
  );

  it('N lower (4 vs 1) → record N lower; only N organizer + shared officer notified', async () => {
    const { service, conflictRepo, notifier } = setup({
      warnings: [clashWith(1)],
      blocking: [],
    });
    await service.create(secretary, dto, null);
    expect(conflictRepo.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        higherMeetingId: 'E',
        lowerMeetingId: 'new-meeting',
      }),
    ]);
    expect(notifier.conflict).toHaveBeenCalledTimes(1);
    expect(notifier.conflict).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'E' }), // higher
      expect.objectContaining({ id: 'new-meeting' }), // lower (their meeting)
      expect.anything(),
      ['secretary', 'shared'],
    );
  });

  it('equal priority (4 vs 4) → BOTH organizers notified, each about their own meeting', async () => {
    const { service, conflictRepo, notifier } = setup({
      warnings: [clashWith(4)],
      blocking: [],
    });
    await service.create(secretary, dto, null);
    expect(conflictRepo.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        higherMeetingId: 'E',
        lowerMeetingId: 'new-meeting',
      }),
    ]);
    const calls = notifier.conflict.mock.calls as Array<
      [unknown, { id: string }, { id: string }, unknown, string[]]
    >;
    expect(calls).toHaveLength(2);
    const byLower = new Map(calls.map((c) => [c[2].id, c[4]]));
    expect(byLower.get('E')).toEqual(['E-organizer']);
    expect(byLower.get('new-meeting')).toEqual(['secretary', 'shared']);
  });

  it('shared officer with several roles is notified once (E organizer is also shared)', async () => {
    const { service, notifier } = setup({
      warnings: [clashWith(9, ['E-organizer', 'shared'])],
      blocking: [],
    });
    await service.create(secretary, dto, null);
    const recipients = (
      notifier.conflict.mock.calls as Array<
        [unknown, unknown, unknown, unknown, string[]]
      >
    ).flatMap((c) => c[4]);
    expect(recipients.sort()).toEqual(['E-organizer', 'shared']);
  });
});

describe('MeetingsService.create: priority from the chair (v1.5)', () => {
  it('internal chair (not the organizer) → chair priority, audit entry and a chair notice', async () => {
    const { service, meetingRepo, audit, notifier } = setup(noClash);
    await service.create(secretary, dto, '10.0.0.1');
    expect(meetingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 4, chairId: 'chair' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      {
        actorId: 'secretary',
        action: AuditAction.MEETING_CHAIR_PRIORITY_APPLIED,
        entityType: 'meeting',
        entityId: 'new-meeting',
        before: { priority: 1 },
        after: { chairId: 'chair', priority: 4 },
        ip: '10.0.0.1',
      },
      expect.anything(),
    );
    expect(notifier.chairAssigned).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'new-meeting' }),
      'chair',
    );
  });

  it('no chair → organizer priority, no chair notice', async () => {
    const { service, meetingRepo, audit, notifier } = setup(noClash);
    await service.create(secretary, { ...dto, chairId: null }, null);
    expect(meetingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 1, chairId: null }),
    );
    expect(notifier.chairAssigned).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.MEETING_CHAIR_PRIORITY_APPLIED,
      }),
      expect.anything(),
    );
  });

  it('the organizer as chair → organizer priority, no chair notice', async () => {
    const { service, meetingRepo, notifier } = setup(noClash);
    await service.create(secretary, { ...dto, chairId: 'secretary' }, null);
    expect(meetingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 1 }),
    );
    expect(notifier.chairAssigned).not.toHaveBeenCalled();
  });

  it('guest chair → organizer priority; guests saved and invited by mail', async () => {
    const { service, meetingRepo, guestRepo, notifier } = setup(noClash);
    const guests = [
      {
        name: 'ড. ফারহানা ইসলাম',
        designation: 'যুগ্মসচিব',
        email: 'farhana@example.org',
        isChair: true,
      },
      { name: 'জন', designation: 'পরামর্শক', email: 'john@example.org' },
    ];
    await service.create(secretary, { ...dto, chairId: null, guests }, null);
    expect(meetingRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 1, chairId: null }),
    );
    expect(guestRepo.insert).toHaveBeenCalledWith([
      { ...guests[0], meetingId: 'new-meeting' },
      { ...guests[1], isChair: false, meetingId: 'new-meeting' },
    ]);
    expect(notifier.guests).toHaveBeenCalledWith(
      expect.anything(),
      'invited',
      expect.objectContaining({
        chairLine: 'ড. ফারহানা ইসলাম, যুগ্মসচিব (অতিথি কর্মকর্তা)',
      }),
      [
        expect.objectContaining({ email: 'farhana@example.org' }),
        expect.objectContaining({ email: 'john@example.org' }),
      ],
    );
    expect(notifier.chairAssigned).not.toHaveBeenCalled();
  });
});

describe('MeetingsService.create: guest officer validation (v1.5)', () => {
  const guest = (email: string, isChair = false) => ({
    name: 'অতিথি',
    designation: 'পরামর্শক',
    email,
    isChair,
  });

  it('duplicate email (case-insensitive) → 400, nothing saved', async () => {
    const { service, meetingRepo } = setup(noClash);
    await expect(
      service.create(
        secretary,
        { ...dto, guests: [guest('a@example.org'), guest('A@Example.org ')] },
        null,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        MEETING_MESSAGES.guestDuplicateEmail('a@example.org'),
      ),
    );
    expect(meetingRepo.save).not.toHaveBeenCalled();
  });

  it('an officer chair and a guest chair together → 400', async () => {
    const { service } = setup(noClash);
    await expect(
      service.create(
        secretary,
        { ...dto, guests: [guest('a@example.org', true)] },
        null,
      ),
    ).rejects.toThrow(new BadRequestException(MEETING_MESSAGES.oneChair));
  });

  it('two guest chairs → 400', async () => {
    const { service } = setup(noClash);
    await expect(
      service.create(
        secretary,
        {
          ...dto,
          chairId: null,
          guests: [guest('a@example.org', true), guest('b@example.org', true)],
        },
        null,
      ),
    ).rejects.toThrow(new BadRequestException(MEETING_MESSAGES.oneChair));
  });

  it('an email that belongs to an officer → 400 telling to pick the officer', async () => {
    const { service, userRepo, meetingRepo } = setup(noClash);
    userRepo.findOne.mockResolvedValue({
      id: 'u1',
      nameBn: 'মোঃ করিম',
      loginEmail: 'karim@bbs.gov.bd',
      notificationEmail: 'karim@bbs.gov.bd',
    });
    await expect(
      service.create(
        secretary,
        { ...dto, guests: [guest('karim@bbs.gov.bd')] },
        null,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        MEETING_MESSAGES.guestIsOfficer('karim@bbs.gov.bd', 'মোঃ করিম'),
      ),
    );
    expect(meetingRepo.save).not.toHaveBeenCalled();
  });
});

describe('MeetingsService: lead rule for the chair (SPEC.md §6.4, v1.13)', () => {
  const chairBusy = (): Clash<LoadedMeeting> => ({
    meeting: loaded('CHAIRS', 9, ['chair']),
    sharedPeopleIds: ['chair'],
    blockedBy: ['CHAIR'],
  });

  it('create: the chair is sent to the engine; chair busy → 409 naming the chair', async () => {
    const { service, engine, meetingRepo } = setup({
      warnings: [],
      blocking: [chairBusy()],
    });
    const err = await service
      .create(secretary, dto, null)
      .catch((e: unknown) => e);
    expect(engine.evaluate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizerId: 'secretary', chairId: 'chair' }),
    );
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      message: MEETING_MESSAGES.chairBlocking,
      blocking: [
        expect.objectContaining({ meetingId: 'CHAIRS', blockedBy: ['CHAIR'] }),
      ],
    });
    expect(meetingRepo.save).not.toHaveBeenCalled();
  });

  it('update that changes ONLY the chair runs the lead rule and is blocked', async () => {
    const parts = setup({ warnings: [], blocking: [chairBusy()] });
    const { service, engine } = parts;
    // The stored meeting: same time, chair "old-chair", member "chair" (becomes the chair).
    const stored = Object.assign(new Meeting(), {
      id: 'm1',
      title: 'সভা',
      status: MeetingStatus.SCHEDULED,
      startAt: new Date('2030-01-01T04:30:00Z'),
      endAt: new Date('2030-01-01T05:30:00Z'),
      room: 'কক্ষ',
      organizerId: 'secretary',
      chairId: 'old-chair',
      priority: 1,
    });
    const qb = {
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(stored),
    };
    Object.assign(parts.meetingRepo, {
      createQueryBuilder: jest.fn(() => qb),
    });
    Object.assign(parts.participantRepo, {
      findBy: jest.fn().mockResolvedValue([
        { userId: 'secretary', role: ParticipantRole.ORGANIZER },
        { userId: 'old-chair', role: ParticipantRole.CHAIR },
        { userId: 'chair', role: ParticipantRole.MEMBER },
      ]),
    });
    Object.assign(parts.guestRepo, { find: jest.fn().mockResolvedValue([]) });

    const err = await service
      .update(
        secretary,
        'm1',
        { chairId: 'chair', participantIds: ['old-chair', 'chair'] },
        null,
      )
      .catch((e: unknown) => e);
    expect(engine.evaluate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'm1', chairId: 'chair' }),
      true, // checkLeads: the chair changed (the time did not)
    );
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      message: MEETING_MESSAGES.chairBlocking,
    });
  });
});
