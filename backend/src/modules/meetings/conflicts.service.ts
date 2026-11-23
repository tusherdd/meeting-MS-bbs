import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  paginated,
  type PaginatedResponseDto,
} from '../../common/dto/paginated-response.dto';
import type { AuthUser } from '../../common/types/auth-user';
import { noticeMimes } from '../notices/notice-mime';
import type { ConflictQueryDto } from './dto/meeting-input.dto';
import type {
  ConflictListItemDto,
  ConflictMeetingRefDto,
} from './dto/meeting-response.dto';
import { MeetingConflict } from './entities/meeting-conflict.entity';
import type { Meeting } from './entities/meeting.entity';
import { ConflictStatus } from './enums/conflict-status.enum';
import { MEETING_MESSAGES as MSG } from './meetings.messages';
import { MeetingsService } from './meetings.service';

/** At most this many resolved conflicts in GET /conflicts/mine?status=RESOLVED. */
export const MINE_RESOLVED_LIMIT = 100;

/** Conflict lists (SPEC.md §8 "Conflicts"). */
@Injectable()
export class ConflictsService {
  constructor(
    @InjectRepository(MeetingConflict)
    private readonly conflicts: Repository<MeetingConflict>,
    private readonly meetings: MeetingsService,
  ) {}

  /**
   * Conflicts where I organize the lower meeting (either meeting on equal priority, v1.12)
   * or I am the shared officer.
   * PENDING by default; RESOLVED for the history tab (newest first).
   */
  async mine(
    actor: AuthUser,
    status: ConflictStatus = ConflictStatus.PENDING,
  ): Promise<ConflictListItemDto[]> {
    const resolved = status === ConflictStatus.RESOLVED;
    const rows = await this.query()
      .where('c.status = :status', { status })
      .andWhere(
        new Brackets((b) =>
          b
            .where('l.organizerId = :me', { me: actor.id })
            .orWhere('c.userId = :me', { me: actor.id })
            // v1.12: on equal priority both organizers are informed, so both see the record.
            .orWhere('(h.organizerId = :me AND h.priority = l.priority)', {
              me: actor.id,
            }),
        ),
      )
      .orderBy(
        resolved ? 'c.resolvedAt' : 'h.startAt',
        resolved ? 'DESC' : 'ASC',
      )
      .addOrderBy('c.id', 'ASC')
      // History is capped; pending conflicts are always few.
      .take(resolved ? MINE_RESOLVED_LIMIT : undefined)
      .getMany();
    return this.toItems(actor, rows);
  }

  /** ADMIN: all conflicts, newest first. */
  async all(
    actor: AuthUser,
    query: ConflictQueryDto,
  ): Promise<PaginatedResponseDto<ConflictListItemDto>> {
    const qb = this.query();
    if (query.status) qb.where('c.status = :status', { status: query.status });
    const [rows, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .addOrderBy('c.id', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return paginated(await this.toItems(actor, rows), total, query);
  }

  private query() {
    return (
      this.conflicts
        .createQueryBuilder('c')
        .innerJoinAndSelect('c.user', 'u')
        .innerJoinAndSelect('c.higherMeeting', 'h')
        .innerJoinAndSelect('h.organizer', 'ho')
        .leftJoinAndSelect('ho.designation', 'hod')
        .leftJoinAndSelect('ho.wing', 'how')
        .innerJoinAndSelect('c.lowerMeeting', 'l')
        .innerJoinAndSelect('l.organizer', 'lo')
        .leftJoinAndSelect('lo.designation', 'lod')
        .leftJoinAndSelect('lo.wing', 'low')
        // v1.13: the row menu shows "সভার নোটিশ" only when a notice exists.
        .loadRelationCountAndMap('h.noticeFileCount', 'h.noticeFiles')
        .loadRelationCountAndMap('l.noticeFileCount', 'l.noticeFiles')
    );
  }

  private async toItems(
    actor: AuthUser,
    rows: MeetingConflict[],
  ): Promise<ConflictListItemDto[]> {
    const visible = await this.meetings.visibleMeetingIds(
      actor,
      rows.flatMap((r) => [r.higherMeetingId, r.lowerMeetingId]),
    );
    // v1.17: notice type for the row menu label.
    const mimes = await noticeMimes(
      this.conflicts.manager,
      rows
        .flatMap((r) => [r.higherMeeting, r.lowerMeeting])
        .filter((m) => (m.noticeFileCount ?? 0) > 0)
        .map((m) => m.id),
    );
    const ref = (m: Meeting): ConflictMeetingRefDto => ({
      id: m.id,
      title: visible.has(m.id) ? m.title : MSG.hiddenTitle,
      titleHidden: !visible.has(m.id),
      startAt: m.startAt,
      endAt: m.endAt,
      priority: m.priority,
      status: m.status,
      organizerDesignation: m.organizer.designation?.nameBn ?? null,
      organizerDesignationEn: m.organizer.designation?.nameEn ?? null,
      organizerWing: m.organizer.wing?.nameBn ?? null,
      organizerWingEn: m.organizer.wing?.nameEn ?? null,
      organizedByMe: m.organizerId === actor.id,
      chairedByMe: m.chairId === actor.id,
      hasNotice: (m.noticeFileCount ?? 0) > 0,
      noticeMime: mimes.get(m.id) ?? null,
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      officer: { id: r.user.id, nameBn: r.user.nameBn, nameEn: r.user.nameEn },
      higherMeeting: ref(r.higherMeeting),
      lowerMeeting: ref(r.lowerMeeting),
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
    }));
  }
}
