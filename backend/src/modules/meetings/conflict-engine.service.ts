import { Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { Meeting } from './entities/meeting.entity';
import { ConflictStatus } from './enums/conflict-status.enum';
import { MeetingStatus } from './enums/meeting-status.enum';
import {
  classifyClashes,
  findClashes,
  lockOrder,
  type CandidateMeeting,
  type Classification,
  type ExistingMeeting,
} from './meeting-rules';

/** An existing meeting with what the engine and its messages need. */
export interface LoadedMeeting extends ExistingMeeting {
  title: string;
  organizerId: string;
  organizerNameBn: string;
  organizerDesignationBn: string | null;
}

export interface ResolvedConflict {
  id: string;
  higherMeetingId: string;
  lowerMeetingId: string;
  userId: string;
}

/**
 * Database side of the conflict engine (SPEC.md §6.4). The DECISION is made by the pure
 * functions in meeting-rules.ts; this class only locks, loads and persists.
 * Every method must run inside the caller's transaction (`manager`).
 */
@Injectable()
export class ConflictEngineService {
  constructor(private readonly audit: AuditService) {}

  /**
   * Serialises all work on the same officers: one transaction-level advisory lock per person,
   * always in sorted order (no deadlocks). A second request for the same officer waits until
   * the first commits and then SEES its meeting, so both can never pass the check.
   */
  async lockPeople(
    manager: EntityManager,
    personIds: readonly string[],
  ): Promise<void> {
    for (const id of lockOrder(personIds)) {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [id],
      );
    }
  }

  /** Clashes of the candidate with existing meetings, split into allowed and blocking. */
  async evaluate(
    manager: EntityManager,
    candidate: CandidateMeeting,
  ): Promise<Classification<LoadedMeeting>> {
    const existing = await this.loadCandidates(manager, candidate);
    return classifyClashes(
      candidate.priority,
      findClashes(candidate, existing),
    );
  }

  /**
   * Coarse SQL pre-filter (same conditions as findClashes, parameterised) followed by loading
   * full meetings; findClashes re-applies every rule in tested code.
   */
  private async loadCandidates(
    manager: EntityManager,
    candidate: CandidateMeeting,
  ): Promise<LoadedMeeting[]> {
    if (candidate.peopleIds.length === 0) return [];
    const rows = await manager.query<Array<{ id: string }>>(
      `SELECT DISTINCT m.id
         FROM meetings m
         JOIN meeting_participants p ON p."meetingId" = m.id
        WHERE m.status = $1
          AND m."startAt" < $3
          AND m."endAt" > $2
          AND p."userId" = ANY($4::uuid[])
          AND ($5::uuid IS NULL OR m.id <> $5::uuid)`,
      [
        MeetingStatus.SCHEDULED,
        candidate.startAt,
        candidate.endAt,
        [...candidate.peopleIds],
        candidate.id ?? null,
      ],
    );
    if (rows.length === 0) return [];

    const meetings = await manager.getRepository(Meeting).find({
      where: { id: In(rows.map((r) => r.id)) },
      relations: { participants: true, organizer: { designation: true } },
    });
    return meetings.map((m) => ({
      id: m.id,
      status: m.status,
      priority: m.priority,
      startAt: m.startAt,
      endAt: m.endAt,
      peopleIds: m.participants.map((p) => p.userId),
      title: m.title,
      organizerId: m.organizerId,
      organizerNameBn: m.organizer.nameBn,
      organizerDesignationBn: m.organizer.designation?.nameBn ?? null,
    }));
  }

  /**
   * Auto-resolve (SPEC.md §6.4): every PENDING conflict touching these meetings that is no
   * longer real becomes RESOLVED — a meeting is no longer SCHEDULED, the times no longer
   * overlap, or the officer is no longer in both meetings. One atomic UPDATE; each resolved
   * row is audited (CONFLICT_RESOLVED). Returns the resolved rows.
   */
  async resolveStale(
    manager: EntityManager,
    meetingIds: readonly string[],
    actorId: string | null,
    ip: string | null,
  ): Promise<ResolvedConflict[]> {
    if (meetingIds.length === 0) return [];
    const result = await manager.query<
      [ResolvedConflict[], number] | ResolvedConflict[]
    >(
      `UPDATE meeting_conflicts c
          SET status = $1, "resolvedAt" = now(), "updatedAt" = now()
         FROM meetings h, meetings l
        WHERE c.status = $2
          AND h.id = c."higherMeetingId"
          AND l.id = c."lowerMeetingId"
          AND (c."higherMeetingId" = ANY($3::uuid[]) OR c."lowerMeetingId" = ANY($3::uuid[]))
          AND NOT (
                h.status = $4 AND l.status = $4
            AND h."startAt" < l."endAt" AND l."startAt" < h."endAt"
            AND EXISTS (SELECT 1 FROM meeting_participants p
                         WHERE p."meetingId" = h.id AND p."userId" = c."userId")
            AND EXISTS (SELECT 1 FROM meeting_participants p
                         WHERE p."meetingId" = l.id AND p."userId" = c."userId")
          )
      RETURNING c.id, c."higherMeetingId", c."lowerMeetingId", c."userId"`,
      [
        ConflictStatus.RESOLVED,
        ConflictStatus.PENDING,
        [...new Set(meetingIds)],
        MeetingStatus.SCHEDULED,
      ],
    );
    // TypeORM returns [rows, affectedCount] for UPDATE ... RETURNING on postgres.
    const rows = (
      Array.isArray(result[0]) ? result[0] : result
    ) as ResolvedConflict[];
    for (const row of rows) {
      await this.audit.log(
        {
          actorId,
          action: AuditAction.CONFLICT_RESOLVED,
          entityType: 'meeting_conflict',
          entityId: row.id,
          after: {
            higherMeetingId: row.higherMeetingId,
            lowerMeetingId: row.lowerMeetingId,
            userId: row.userId,
          },
          ip,
        },
        manager,
      );
    }
    return rows;
  }
}
