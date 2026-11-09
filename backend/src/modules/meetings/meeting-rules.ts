/**
 * Pure meeting rules (SPEC.md §6.3–6.4). No database access: the conflict engine loads
 * candidate meetings and lets these functions decide, so the rules are unit-tested as a table.
 */
import { MeetingStatus } from './enums/meeting-status.enum';

export const MAX_DURATION_MS = 12 * 3_600_000;
/** Clock skew / slow form submit tolerance for "not in the past". */
export const PAST_TOLERANCE_MS = 5 * 60_000;

/** People of a meeting = organizer ∪ chair ∪ participants (deduplicated). */
export function meetingPeople(
  organizerId: string,
  chairId: string | null | undefined,
  participantIds: readonly string[],
): string[] {
  return [
    ...new Set([organizerId, ...(chairId ? [chairId] : []), ...participantIds]),
  ];
}

export interface TimeRange {
  startAt: Date;
  endAt: Date;
}

/** Half-open overlap: 10:00–11:00 and 11:00–12:00 do NOT overlap. */
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return (
    a.startAt.getTime() < b.endAt.getTime() &&
    b.startAt.getTime() < a.endAt.getTime()
  );
}

export type TimeProblem = 'endBeforeStart' | 'tooLong' | 'inPast';

/** Problems with a proposed time range (empty = fine). */
export function timeProblems(
  range: TimeRange,
  now: Date,
  checkPast: boolean,
): TimeProblem[] {
  const problems: TimeProblem[] = [];
  const duration = range.endAt.getTime() - range.startAt.getTime();
  if (duration <= 0) problems.push('endBeforeStart');
  else if (duration > MAX_DURATION_MS) problems.push('tooLong');
  if (
    checkPast &&
    range.startAt.getTime() < now.getTime() - PAST_TOLERANCE_MS
  ) {
    problems.push('inPast');
  }
  return problems;
}

/** The meeting being created or updated ("N"). */
export interface CandidateMeeting extends TimeRange {
  /** Set on update: the meeting never clashes with itself. */
  id?: string;
  priority: number;
  peopleIds: readonly string[];
}

/** An existing meeting ("E") as loaded by the engine. */
export interface ExistingMeeting extends TimeRange {
  id: string;
  status: MeetingStatus;
  priority: number;
  peopleIds: readonly string[];
}

export interface Clash<M extends ExistingMeeting = ExistingMeeting> {
  meeting: M;
  /** People in BOTH meetings (sorted). */
  sharedPeopleIds: string[];
}

/**
 * Existing meetings that clash with the candidate: SCHEDULED, overlapping in time, not the
 * candidate itself, and sharing at least one person.
 */
export function findClashes<M extends ExistingMeeting>(
  candidate: CandidateMeeting,
  existing: readonly M[],
): Clash<M>[] {
  const people = new Set(candidate.peopleIds);
  const clashes: Clash<M>[] = [];
  for (const meeting of existing) {
    if (meeting.status !== MeetingStatus.SCHEDULED) continue;
    if (candidate.id && meeting.id === candidate.id) continue;
    if (!overlaps(candidate, meeting)) continue;
    const shared = [...new Set(meeting.peopleIds)]
      .filter((id) => people.has(id))
      .sort();
    if (shared.length > 0) clashes.push({ meeting, sharedPeopleIds: shared });
  }
  return clashes;
}

export interface Classification<M extends ExistingMeeting> {
  /** N has strictly higher priority (smaller number): N may be saved, E gets a conflict. */
  allowed: Clash<M>[];
  /** Equal or lower priority: N must not be saved. */
  blocking: Clash<M>[];
}

/** SPEC.md §6.4: N.priority < E.priority → allowed; N.priority >= E.priority → blocking. */
export function classifyClashes<M extends ExistingMeeting>(
  candidatePriority: number,
  clashes: readonly Clash<M>[],
): Classification<M> {
  const allowed: Clash<M>[] = [];
  const blocking: Clash<M>[] = [];
  for (const clash of clashes) {
    (candidatePriority < clash.meeting.priority ? allowed : blocking).push(
      clash,
    );
  }
  return { allowed, blocking };
}

/** Advisory-lock order: sorted, so two transactions never wait on each other in a cycle. */
export function lockOrder(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}
