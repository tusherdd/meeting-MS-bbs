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
    organizerNameBn: 'আয়োজক',
    organizerDesignationBn: 'উপপরিচালক',
  };
}

function setup(classification: {
  allowed: Clash<LoadedMeeting>[];
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
  chairId: 'chair' as string | null,
  participantIds: ['shared', 'secretary'],
};
const noClash = { allowed: [], blocking: [] };

describe('MeetingsService.create', () => {
  it('higher priority → saved, conflict rows per shared officer, notifications', async () => {
    const lower = loaded('E', 7, ['E-organizer', 'shared']);
    const {
      service,
      engine,
      meetingRepo,
      participantRepo,
      conflictRepo,
      notifier,
    } = setup({
      allowed: [{ meeting: lower, sharedPeopleIds: ['shared'] }],
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
    expect(notifier.conflict).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 'new-meeting',
        leadDesignationBn: 'পরিচালক', // the chair's designation
      }),
      new Set(['secretary', 'chair', 'shared']),
      lower,
      [{ id: 'shared', nameBn: 'নাম shared' }],
      ['E-organizer', 'shared'],
    );
    expect(notifier.invited).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ['chair', 'shared'],
    );
  });

  it('mixed case (one allowed + one blocking) → 409 and NOTHING is saved', async () => {
    const { service, meetingRepo, participantRepo, conflictRepo, notifier } =
      setup({
        allowed: [
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
          sharedOfficers: [{ id: 'shared', nameBn: 'নাম shared' }],
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
      allowed: [],
      blocking: [],
    });
    await service.create(secretary, dto, null);
    expect(meetingRepo.save).toHaveBeenCalled();
    expect(conflictRepo.insert).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN cannot organize', async () => {
    const { service, userRepo, meetingRepo } = setup({
      allowed: [],
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
