import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  paginated,
  type PaginatedResponseDto,
} from '../../common/dto/paginated-response.dto';
import type { AuthUser } from '../../common/types/auth-user';
import { getDayRange } from '../../common/utils/time';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import {
  ConflictEngineService,
  type LoadedMeeting,
} from './conflict-engine.service';
import type {
  CancelMeetingDto,
  CheckConflictsDto,
  CompleteMeetingDto,
  CreateMeetingDto,
  MeetingQueryDto,
  UpdateMeetingDto,
} from './dto/meeting-input.dto';
import type {
  CheckConflictsResponseDto,
  ClashDto,
  MeetingConflictDto,
  MeetingDetailDto,
  MeetingSummaryDto,
  PersonDto,
} from './dto/meeting-response.dto';
import { MeetingConflict } from './entities/meeting-conflict.entity';
import { MeetingParticipant } from './entities/meeting-participant.entity';
import { Meeting } from './entities/meeting.entity';
import { ConflictStatus } from './enums/conflict-status.enum';
import { MeetingStatus } from './enums/meeting-status.enum';
import { ParticipantRole } from './enums/participant-role.enum';
import { formatDhakaRange } from './meeting-format';
import {
  MeetingNotifierService,
  type MeetingChange,
  type MeetingInfo,
} from './meeting-notifier.service';
import {
  meetingPeople,
  timeProblems,
  type Clash,
  type TimeProblem,
} from './meeting-rules';
import { MEETING_MESSAGES as MSG } from './meetings.messages';

const TIME_MESSAGES: Record<TimeProblem, string> = {
  endBeforeStart: MSG.endBeforeStart,
  tooLong: MSG.tooLong,
  inPast: MSG.inPast,
};

export function isAdmin(actor: Pick<AuthUser, 'role'>): boolean {
  return actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
}

function personDto(u: User): PersonDto {
  return {
    id: u.id,
    nameBn: u.nameBn,
    nameEn: u.nameEn,
    designation: u.designation
      ? {
          nameBn: u.designation.nameBn,
          nameEn: u.designation.nameEn,
          priority: u.designation.priority,
        }
      : null,
  };
}

/**
 * Meetings (SPEC.md §6.3) with the priority conflict engine (§6.4). Every write runs in ONE
 * transaction: validate → lock the people → check → save → conflicts → notices → audit.
 */
@Injectable()
export class MeetingsService {
  constructor(
    @InjectRepository(Meeting) private readonly meetings: Repository<Meeting>,
    private readonly engine: ConflictEngineService,
    private readonly notifier: MeetingNotifierService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  // ================================================================= create

  async create(
    actor: AuthUser,
    dto: CreateMeetingDto,
    ip: string | null,
  ): Promise<MeetingDetailDto> {
    const { startAt, endAt } = this.parseTimes(dto.startAt, dto.endAt, true);

    const id = await this.dataSource.transaction(async (manager) => {
      const organizer = await this.loadOrganizer(manager, actor.id);
      const chairId = dto.chairId ?? null;
      const memberIds = (dto.participantIds ?? []).filter(
        (p) => p !== actor.id,
      );
      const people = meetingPeople(actor.id, chairId, memberIds);
      const invitees = people.filter((p) => p !== actor.id);
      await this.assertPeopleUsable(manager, invitees);

      // Snapshot (SPEC.md §6.3): never recalculated later.
      const priority = organizer.designation!.priority;
      await this.engine.lockPeople(manager, people);
      const { allowed, blocking } = await this.engine.evaluate(manager, {
        startAt,
        endAt,
        priority,
        peopleIds: people,
      });
      if (blocking.length > 0)
        throw await this.blockingError(manager, actor, blocking);

      const repo = manager.getRepository(Meeting);
      const meeting = await repo.save(
        repo.create({
          title: dto.title,
          agenda: dto.agenda ?? null,
          startAt,
          endAt,
          room: dto.room ?? null,
          onlineLink: dto.onlineLink ?? null,
          organizerId: actor.id,
          chairId,
          priority,
          status: MeetingStatus.SCHEDULED,
        }),
      );
      await this.writeParticipants(
        manager,
        meeting.id,
        actor.id,
        chairId,
        memberIds,
      );

      await this.audit.log(
        {
          actorId: actor.id,
          action: AuditAction.MEETING_CREATE,
          entityType: 'meeting',
          entityId: meeting.id,
          after: {
            title: meeting.title,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            priority,
            people,
          },
          ip,
        },
        manager,
      );

      const info = this.info(meeting, organizer);
      await this.createConflicts(
        manager,
        actor,
        ip,
        info,
        new Set(people),
        allowed,
      );
      await this.notifier.invited(manager, info, invitees);
      return meeting.id;
    });

    return this.findOne(actor, id);
  }

  // ================================================================= update

  async update(
    actor: AuthUser,
    id: string,
    dto: UpdateMeetingDto,
    ip: string | null,
  ): Promise<MeetingDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const meeting = await this.lockMeeting(manager, id);
      const oldPeople = meeting.participants.map((p) => p.userId);
      this.assertCanManage(actor, meeting, oldPeople);
      if (meeting.status !== MeetingStatus.SCHEDULED)
        throw new ConflictException(MSG.notScheduled);
      if (meeting.endAt.getTime() <= Date.now())
        throw new ConflictException(MSG.alreadyEnded);

      const startAt =
        dto.startAt !== undefined ? new Date(dto.startAt) : meeting.startAt;
      const endAt =
        dto.endAt !== undefined ? new Date(dto.endAt) : meeting.endAt;
      const timeChanged =
        startAt.getTime() !== meeting.startAt.getTime() ||
        endAt.getTime() !== meeting.endAt.getTime();
      if (dto.startAt !== undefined || dto.endAt !== undefined) {
        this.assertTimes(startAt, endAt, timeChanged);
      }

      const chairId = dto.chairId !== undefined ? dto.chairId : meeting.chairId;
      const memberIds = (
        dto.participantIds !== undefined
          ? dto.participantIds
          : meeting.participants
              .filter((p) => p.role === ParticipantRole.MEMBER)
              .map((p) => p.userId)
      ).filter((p) => p !== meeting.organizerId);
      const newPeople = meetingPeople(meeting.organizerId, chairId, memberIds);
      const oldSet = new Set(oldPeople);
      const newSet = new Set(newPeople);
      const added = newPeople.filter((p) => !oldSet.has(p));
      const removed = oldPeople.filter((p) => !newSet.has(p));
      const peopleChanged = added.length > 0 || removed.length > 0;
      const chairChanged = (chairId ?? null) !== (meeting.chairId ?? null);
      await this.assertPeopleUsable(manager, [
        ...added,
        ...(chairChanged && chairId ? [chairId] : []),
      ]);

      // SPEC.md §6.4: the engine re-runs when the time or the people change.
      let allowed: Clash<LoadedMeeting>[] = [];
      if (timeChanged || peopleChanged) {
        await this.engine.lockPeople(manager, [...oldPeople, ...newPeople]);
        const result = await this.engine.evaluate(manager, {
          id: meeting.id,
          startAt,
          endAt,
          priority: meeting.priority, // the snapshot, never the organizer's current priority
          peopleIds: newPeople,
        });
        if (result.blocking.length > 0) {
          throw await this.blockingError(manager, actor, result.blocking);
        }
        allowed = result.allowed;
      }

      const before = this.snapshot(meeting, oldPeople);
      const changes = this.describeChanges(meeting, {
        title: dto.title ?? meeting.title,
        startAt,
        endAt,
        room: dto.room !== undefined ? dto.room : meeting.room,
        onlineLink:
          dto.onlineLink !== undefined ? dto.onlineLink : meeting.onlineLink,
      });

      await manager.getRepository(Meeting).update(meeting.id, {
        title: dto.title ?? meeting.title,
        agenda: dto.agenda !== undefined ? dto.agenda : meeting.agenda,
        startAt,
        endAt,
        room: dto.room !== undefined ? dto.room : meeting.room,
        onlineLink:
          dto.onlineLink !== undefined ? dto.onlineLink : meeting.onlineLink,
        chairId,
      });
      if (peopleChanged || chairChanged || dto.participantIds !== undefined) {
        await manager
          .getRepository(MeetingParticipant)
          .delete({ meetingId: meeting.id });
        await this.writeParticipants(
          manager,
          meeting.id,
          meeting.organizerId,
          chairId,
          memberIds,
        );
      }

      // Conflicts: drop those that disappeared, add new ones (never duplicates).
      await this.engine.resolveStale(manager, [meeting.id], actor.id, ip);
      const updated = await this.lockMeeting(manager, meeting.id);
      const organizer = await this.loadUser(manager, meeting.organizerId);
      const info = this.info(updated, organizer);
      if (allowed.length > 0) {
        await this.createConflicts(manager, actor, ip, info, newSet, allowed);
      }

      await this.audit.log(
        {
          actorId: actor.id,
          action: AuditAction.MEETING_UPDATE,
          entityType: 'meeting',
          entityId: meeting.id,
          before,
          after: this.snapshot(updated, newPeople),
          ip,
        },
        manager,
      );

      const remaining = newPeople.filter(
        (p) => oldSet.has(p) && p !== actor.id,
      );
      await this.notifier.removed(
        manager,
        info,
        removed.filter((p) => p !== actor.id),
      );
      await this.notifier.invited(
        manager,
        info,
        added.filter((p) => p !== actor.id),
      );
      await this.notifier.updated(manager, info, remaining, changes);
    });
    return this.findOne(actor, id);
  }

  // ================================================================= cancel / complete / delete

  async cancel(
    actor: AuthUser,
    id: string,
    dto: CancelMeetingDto,
    ip: string | null,
  ): Promise<MeetingDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const meeting = await this.lockMeeting(manager, id);
      const people = meeting.participants.map((p) => p.userId);
      this.assertCanManage(actor, meeting, people);
      if (meeting.status !== MeetingStatus.SCHEDULED)
        throw new ConflictException(MSG.notScheduled);

      // Same locks as create/update: a parallel create cannot raise a conflict on a meeting
      // that is being cancelled at this very moment.
      await this.engine.lockPeople(manager, people);
      await manager.getRepository(Meeting).update(id, {
        status: MeetingStatus.CANCELLED,
        cancelReason: dto.reason,
        cancelledAt: new Date(),
      });
      await this.engine.resolveStale(manager, [id], actor.id, ip);
      await this.audit.log(
        {
          actorId: actor.id,
          action: AuditAction.MEETING_CANCEL,
          entityType: 'meeting',
          entityId: id,
          before: { status: meeting.status },
          after: { status: MeetingStatus.CANCELLED, reason: dto.reason },
          ip,
        },
        manager,
      );
      const organizer = await this.loadUser(manager, meeting.organizerId);
      await this.notifier.cancelled(
        manager,
        this.info(meeting, organizer),
        people.filter((p) => p !== actor.id),
        dto.reason,
      );
    });
    return this.findOne(actor, id);
  }

  /** Mark completed with notes/minutes; only after the start. Notes may be updated later. */
  async complete(
    actor: AuthUser,
    id: string,
    dto: CompleteMeetingDto,
    ip: string | null,
  ): Promise<MeetingDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const meeting = await this.lockMeeting(manager, id);
      this.assertCanManage(
        actor,
        meeting,
        meeting.participants.map((p) => p.userId),
      );
      if (meeting.status === MeetingStatus.CANCELLED) {
        throw new ConflictException(MSG.cancelledCannotComplete);
      }
      if (Date.now() < meeting.startAt.getTime())
        throw new ConflictException(MSG.notStartedYet);

      await manager.getRepository(Meeting).update(id, {
        status: MeetingStatus.COMPLETED,
        completedAt: meeting.completedAt ?? new Date(),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      });
      await this.engine.resolveStale(manager, [id], actor.id, ip);
      await this.audit.log(
        {
          actorId: actor.id,
          action: AuditAction.MEETING_COMPLETE,
          entityType: 'meeting',
          entityId: id,
          before: { status: meeting.status },
          after: {
            status: MeetingStatus.COMPLETED,
            notesUpdated: dto.notes !== undefined,
          },
          ip,
        },
        manager,
      );
    });
    return this.findOne(actor, id);
  }

  /** ADMIN hard delete; participants and conflicts go with it (CASCADE). */
  async remove(actor: AuthUser, id: string, ip: string | null): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const meeting = await this.lockMeeting(manager, id);
      await this.audit.log(
        {
          actorId: actor.id,
          action: AuditAction.MEETING_DELETE,
          entityType: 'meeting',
          entityId: id,
          before: this.snapshot(
            meeting,
            meeting.participants.map((p) => p.userId),
          ),
          ip,
        },
        manager,
      );
      await manager.getRepository(Meeting).delete(id);
    });
  }

  // ================================================================= dry run

  /** The same engine as create/update, nothing saved (live warning in the form). */
  async checkConflicts(
    actor: AuthUser,
    dto: CheckConflictsDto,
  ): Promise<CheckConflictsResponseDto> {
    const manager = this.dataSource.manager;
    let organizerId = actor.id;
    let priority: number;
    let existingTimes: { startAt: Date; endAt: Date } | null = null;

    if (dto.meetingId) {
      const meeting = await this.loadMeeting(manager, dto.meetingId);
      this.assertCanManage(
        actor,
        meeting,
        meeting.participants.map((p) => p.userId),
      );
      organizerId = meeting.organizerId;
      priority = meeting.priority;
      existingTimes = { startAt: meeting.startAt, endAt: meeting.endAt };
    } else {
      priority = (await this.loadOrganizer(manager, actor.id)).designation!
        .priority;
    }

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    const moved =
      !existingTimes ||
      existingTimes.startAt.getTime() !== startAt.getTime() ||
      existingTimes.endAt.getTime() !== endAt.getTime();
    this.assertTimes(startAt, endAt, moved);

    const memberIds = (dto.participantIds ?? []).filter(
      (p) => p !== organizerId,
    );
    const people = meetingPeople(organizerId, dto.chairId ?? null, memberIds);
    await this.assertPeopleUsable(
      manager,
      people.filter((p) => p !== organizerId),
    );

    const { allowed, blocking } = await this.engine.evaluate(manager, {
      id: dto.meetingId,
      startAt,
      endAt,
      priority,
      peopleIds: people,
    });
    return {
      allowed: blocking.length === 0,
      blocking: await this.clashDtos(manager, actor, blocking),
      willNotify: await this.clashDtos(manager, actor, allowed),
    };
  }

  // ================================================================= reads

  async findOne(actor: AuthUser, id: string): Promise<MeetingDetailDto> {
    const meeting = await this.meetings.findOne({
      where: { id },
      relations: {
        organizer: { designation: true },
        chair: { designation: true },
        participants: { user: { designation: true } },
      },
    });
    const people = meeting?.participants.map((p) => p.userId) ?? [];
    // Not one of its people and not an admin → "not found" (existence is not revealed).
    if (!meeting || !(isAdmin(actor) || people.includes(actor.id))) {
      throw new NotFoundException(MSG.notFound);
    }
    return {
      ...this.summary(meeting, actor),
      agenda: meeting.agenda,
      chair: meeting.chair ? personDto(meeting.chair) : null,
      participants: meeting.participants
        .map((p) => ({ ...personDto(p.user), role: p.role }))
        .sort(
          (a, b) =>
            roleRank(a.role) - roleRank(b.role) ||
            a.nameEn.localeCompare(b.nameEn),
        ),
      notes: meeting.notes,
      cancelReason: meeting.cancelReason,
      cancelledAt: meeting.cancelledAt,
      completedAt: meeting.completedAt,
      conflicts: await this.conflictsOf(actor, meeting.id),
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    };
  }

  /** My meetings that touch today in Asia/Dhaka, ordered by start. */
  async today(actor: AuthUser, now = new Date()): Promise<MeetingSummaryDto[]> {
    const { start, end } = getDayRange(now);
    const rows = await this.baseQuery(actor, 'mine')
      .andWhere('m.startAt < :end AND m.endAt > :start', { start, end })
      .orderBy('m.startAt', 'ASC')
      .getMany();
    return this.withMyRoles(actor, rows);
  }

  async list(
    actor: AuthUser,
    query: MeetingQueryDto,
  ): Promise<PaginatedResponseDto<MeetingSummaryDto>> {
    if (query.scope === 'all' && !isAdmin(actor))
      throw new ForbiddenException(MSG.scopeAllAdminOnly);
    const qb = this.baseQuery(actor, query.scope === 'all' ? 'all' : 'mine');
    if (query.role === 'organizer')
      qb.andWhere('m.organizerId = :me', { me: actor.id });
    if (query.role === 'participant')
      qb.andWhere('m.organizerId <> :me', { me: actor.id });
    if (query.from)
      qb.andWhere('m.endAt > :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('m.startAt < :to', { to: new Date(query.to) });
    if (query.status)
      qb.andWhere('m.status = :status', { status: query.status });
    qb.orderBy('m.startAt', 'ASC')
      .addOrderBy('m.id', 'ASC')
      .skip(query.skip)
      .take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    return paginated(await this.withMyRoles(actor, rows), total, query);
  }

  // ================================================================= helpers: validation

  private parseTimes(start: string, end: string, checkPast: boolean) {
    const startAt = new Date(start);
    const endAt = new Date(end);
    this.assertTimes(startAt, endAt, checkPast);
    return { startAt, endAt };
  }

  private assertTimes(startAt: Date, endAt: Date, checkPast: boolean): void {
    const problems = timeProblems({ startAt, endAt }, new Date(), checkPast);
    if (problems.length > 0)
      throw new BadRequestException(problems.map((p) => TIME_MESSAGES[p]));
  }

  /** The organizer must be a real officer with a designation (no SUPER_ADMIN, no "on behalf"). */
  private async loadOrganizer(
    manager: EntityManager,
    userId: string,
  ): Promise<User> {
    const user = await this.loadUser(manager, userId);
    if (user.role === UserRole.SUPER_ADMIN)
      throw new ForbiddenException(MSG.superAdminOrganize);
    if (!user.designation)
      throw new ForbiddenException(MSG.organizerNoDesignation);
    return user;
  }

  private async loadUser(
    manager: EntityManager,
    userId: string,
  ): Promise<User> {
    return manager.getRepository(User).findOneOrFail({
      where: { id: userId },
      relations: { designation: true },
    });
  }

  /** Invitees must exist, be active and be officers (SUPER_ADMIN cannot be invited). */
  private async assertPeopleUsable(
    manager: EntityManager,
    ids: string[],
  ): Promise<void> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const users = await manager.getRepository(User).find({
      select: { id: true, isActive: true, role: true, designationId: true },
      where: { id: In(unique) },
    });
    if (users.length !== unique.length || users.some((u) => !u.isActive)) {
      throw new BadRequestException(MSG.peopleInvalid);
    }
    if (
      users.some((u) => u.role === UserRole.SUPER_ADMIN || !u.designationId)
    ) {
      throw new BadRequestException(MSG.superAdminInvite);
    }
  }

  /** People of the meeting or admins see it (else 404); only organizer/admin may change it (else 403). */
  private assertCanManage(
    actor: AuthUser,
    meeting: Meeting,
    peopleIds: string[],
  ): void {
    if (!isAdmin(actor) && !peopleIds.includes(actor.id))
      throw new NotFoundException(MSG.notFound);
    if (!isAdmin(actor) && meeting.organizerId !== actor.id) {
      throw new ForbiddenException(MSG.notOrganizer);
    }
  }

  // ================================================================= helpers: persistence

  /** Row lock on the meeting (no outer joins under FOR UPDATE), then its participants. */
  private async lockMeeting(
    manager: EntityManager,
    id: string,
  ): Promise<Meeting> {
    const meeting = await manager
      .getRepository(Meeting)
      .createQueryBuilder('m')
      .where('m.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
    if (!meeting) throw new NotFoundException(MSG.notFound);
    meeting.participants = await manager
      .getRepository(MeetingParticipant)
      .findBy({ meetingId: id });
    return meeting;
  }

  private async loadMeeting(
    manager: EntityManager,
    id: string,
  ): Promise<Meeting> {
    const meeting = await manager.getRepository(Meeting).findOne({
      where: { id },
      relations: { participants: true },
    });
    if (!meeting) throw new NotFoundException(MSG.notFound);
    return meeting;
  }

  /** Organizer row (ORGANIZER), chair (CHAIR, unless the organizer chairs), members (MEMBER). */
  private async writeParticipants(
    manager: EntityManager,
    meetingId: string,
    organizerId: string,
    chairId: string | null,
    memberIds: string[],
  ): Promise<void> {
    const rows = [
      { meetingId, userId: organizerId, role: ParticipantRole.ORGANIZER },
    ];
    if (chairId && chairId !== organizerId) {
      rows.push({ meetingId, userId: chairId, role: ParticipantRole.CHAIR });
    }
    for (const userId of new Set(memberIds)) {
      if (userId !== organizerId && userId !== chairId) {
        rows.push({ meetingId, userId, role: ParticipantRole.MEMBER });
      }
    }
    await manager.getRepository(MeetingParticipant).insert(rows);
  }

  /**
   * One PENDING conflict per (higher N, lower E, shared officer) — existing ones are not
   * duplicated. Notifies E's organizer and the newly affected shared officers.
   */
  private async createConflicts(
    manager: EntityManager,
    actor: AuthUser,
    ip: string | null,
    higher: MeetingInfo,
    higherPeople: ReadonlySet<string>,
    clashes: Clash<LoadedMeeting>[],
  ): Promise<void> {
    if (clashes.length === 0) return;
    const existing = await manager.getRepository(MeetingConflict).find({
      select: { lowerMeetingId: true, userId: true },
      where: {
        higherMeetingId: higher.id,
        status: ConflictStatus.PENDING,
        lowerMeetingId: In(clashes.map((c) => c.meeting.id)),
      },
    });
    const have = new Set(
      existing.map((c) => `${c.lowerMeetingId}:${c.userId}`),
    );
    const names = await this.namesOf(
      manager,
      clashes.flatMap((c) => c.sharedPeopleIds),
    );

    for (const clash of clashes) {
      const fresh = clash.sharedPeopleIds.filter(
        (u) => !have.has(`${clash.meeting.id}:${u}`),
      );
      if (fresh.length === 0) continue;
      const result = await manager.getRepository(MeetingConflict).insert(
        fresh.map((userId) => ({
          higherMeetingId: higher.id,
          lowerMeetingId: clash.meeting.id,
          userId,
          status: ConflictStatus.PENDING,
        })),
      );
      for (const [i, identifier] of result.identifiers.entries()) {
        await this.audit.log(
          {
            actorId: actor.id,
            action: AuditAction.CONFLICT_CREATED,
            entityType: 'meeting_conflict',
            entityId: (identifier as { id: string }).id,
            after: {
              higherMeetingId: higher.id,
              lowerMeetingId: clash.meeting.id,
              userId: fresh[i],
            },
            ip,
          },
          manager,
        );
      }
      await this.notifier.conflict(
        manager,
        higher,
        higherPeople,
        clash.meeting,
        clash.sharedPeopleIds.map((u) => names.get(u) ?? '—'),
        [...new Set([clash.meeting.organizerId, ...fresh])],
      );
    }
  }

  // ================================================================= helpers: responses

  private async blockingError(
    manager: EntityManager,
    actor: AuthUser,
    blocking: Clash<LoadedMeeting>[],
  ): Promise<ConflictException> {
    return new ConflictException({
      message: MSG.blocking,
      blocking: await this.clashDtos(manager, actor, blocking),
    });
  }

  /** Titles of other meetings only for their people and admins (privacy, step 8). */
  private async clashDtos(
    manager: EntityManager,
    actor: AuthUser,
    clashes: Clash<LoadedMeeting>[],
  ): Promise<ClashDto[]> {
    const names = await this.namesOf(
      manager,
      clashes.flatMap((c) => c.sharedPeopleIds),
    );
    return clashes.map((c) => ({
      meetingId: c.meeting.id,
      title:
        isAdmin(actor) || c.meeting.peopleIds.includes(actor.id)
          ? c.meeting.title
          : MSG.hiddenTitle,
      startAt: c.meeting.startAt,
      endAt: c.meeting.endAt,
      priority: c.meeting.priority,
      organizer: {
        name: c.meeting.organizerNameBn,
        designation: c.meeting.organizerDesignationBn,
      },
      sharedOfficers: c.sharedPeopleIds.map((id) => ({
        id,
        nameBn: names.get(id) ?? '—',
      })),
    }));
  }

  private async namesOf(
    manager: EntityManager,
    ids: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const users = await manager.getRepository(User).find({
      select: { id: true, nameBn: true },
      where: { id: In(unique) },
    });
    return new Map(users.map((u) => [u.id, u.nameBn]));
  }

  private info(meeting: Meeting, organizer: User): MeetingInfo {
    return {
      id: meeting.id,
      title: meeting.title,
      startAt: meeting.startAt,
      endAt: meeting.endAt,
      room: meeting.room,
      onlineLink: meeting.onlineLink,
      organizerNameBn: organizer.nameBn,
      organizerDesignationBn: organizer.designation?.nameBn ?? null,
    };
  }

  private describeChanges(
    before: Meeting,
    after: {
      title: string;
      startAt: Date;
      endAt: Date;
      room: string | null;
      onlineLink: string | null;
    },
  ): MeetingChange[] {
    const changes: MeetingChange[] = [];
    if (after.title !== before.title) {
      changes.push({
        label: 'শিরোনাম',
        before: before.title,
        after: after.title,
      });
    }
    if (
      after.startAt.getTime() !== before.startAt.getTime() ||
      after.endAt.getTime() !== before.endAt.getTime()
    ) {
      changes.push({
        label: 'সময়',
        before: formatDhakaRange(before.startAt, before.endAt),
        after: formatDhakaRange(after.startAt, after.endAt),
      });
    }
    if ((after.room ?? null) !== (before.room ?? null)) {
      changes.push({
        label: 'স্থান',
        before: before.room ?? '—',
        after: after.room ?? '—',
      });
    }
    if ((after.onlineLink ?? null) !== (before.onlineLink ?? null)) {
      changes.push({
        label: 'অনলাইন লিংক',
        before: before.onlineLink ?? '—',
        after: after.onlineLink ?? '—',
      });
    }
    return changes;
  }

  private snapshot(m: Meeting, people: string[]): Record<string, unknown> {
    return {
      title: m.title,
      startAt: m.startAt.toISOString(),
      endAt: m.endAt.toISOString(),
      room: m.room,
      onlineLink: m.onlineLink,
      chairId: m.chairId,
      status: m.status,
      people: [...people].sort(),
    };
  }

  private baseQuery(actor: AuthUser, scope: 'mine' | 'all') {
    const qb = this.meetings
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.organizer', 'o')
      .leftJoinAndSelect('o.designation', 'od');
    if (scope === 'mine') {
      qb.where(
        new Brackets((b) =>
          b.where(
            'EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp."meetingId" = m.id AND mp."userId" = :me)',
            { me: actor.id },
          ),
        ),
      );
    }
    return qb;
  }

  private async withMyRoles(
    actor: AuthUser,
    rows: Meeting[],
  ): Promise<MeetingSummaryDto[]> {
    const mine = rows.length
      ? await this.dataSource.getRepository(MeetingParticipant).find({
          select: { meetingId: true, role: true },
          where: { userId: actor.id, meetingId: In(rows.map((r) => r.id)) },
        })
      : [];
    const roleOf = new Map(mine.map((p) => [p.meetingId, p.role]));
    return rows.map((m) => ({
      ...this.summary(m, actor),
      myRole: roleOf.get(m.id) ?? null,
    }));
  }

  private summary(m: Meeting, actor: AuthUser): MeetingSummaryDto {
    return {
      id: m.id,
      title: m.title,
      startAt: m.startAt,
      endAt: m.endAt,
      room: m.room,
      onlineLink: m.onlineLink,
      status: m.status,
      priority: m.priority,
      organizer: personDto(m.organizer),
      myRole: m.participants?.find((p) => p.userId === actor.id)?.role ?? null,
    };
  }

  /** Conflicts in which this meeting is the higher or the lower one. */
  private async conflictsOf(
    actor: AuthUser,
    meetingId: string,
  ): Promise<MeetingConflictDto[]> {
    const rows = await this.dataSource.getRepository(MeetingConflict).find({
      where: [{ higherMeetingId: meetingId }, { lowerMeetingId: meetingId }],
      relations: {
        user: true,
        higherMeeting: { organizer: { designation: true } },
        lowerMeeting: { organizer: { designation: true } },
      },
      order: { createdAt: 'DESC' },
    });
    const otherIds = rows.map((r) =>
      r.higherMeetingId === meetingId ? r.lowerMeetingId : r.higherMeetingId,
    );
    const visible = await this.visibleMeetingIds(actor, otherIds);
    return rows.map((r) => {
      const isHigher = r.higherMeetingId === meetingId;
      const other = isHigher ? r.lowerMeeting : r.higherMeeting;
      return {
        id: r.id,
        status: r.status,
        relation: isHigher ? 'HIGHER' : 'LOWER',
        otherMeeting: {
          id: other.id,
          title: visible.has(other.id) ? other.title : MSG.hiddenTitle,
          startAt: other.startAt,
          endAt: other.endAt,
          priority: other.priority,
          status: other.status,
          organizerDesignation: other.organizer.designation?.nameBn ?? null,
        },
        officer: { id: r.user.id, nameBn: r.user.nameBn },
        resolvedAt: r.resolvedAt,
      };
    });
  }

  /** Meeting ids whose title the actor may see (admin: all; otherwise where they are a person). */
  async visibleMeetingIds(
    actor: AuthUser,
    meetingIds: string[],
  ): Promise<Set<string>> {
    const unique = [...new Set(meetingIds)];
    if (isAdmin(actor)) return new Set(unique);
    if (unique.length === 0) return new Set();
    const rows = await this.dataSource.getRepository(MeetingParticipant).find({
      select: { meetingId: true },
      where: { userId: actor.id, meetingId: In(unique) },
    });
    return new Set(rows.map((r) => r.meetingId));
  }
}

function roleRank(role: ParticipantRole): number {
  return role === ParticipantRole.ORGANIZER
    ? 0
    : role === ParticipantRole.CHAIR
      ? 1
      : 2;
}
