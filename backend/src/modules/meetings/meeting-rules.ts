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

/**
 * Meeting priority snapshot (SPEC.md §6.3, v1.5): an internal chair gives the meeting the
 * chair's designation priority; a guest chair or no chair leaves the organizer's.
 * `chair` is the internal chair (null when the chair is a guest officer or there is none).
 */
export function meetingPriority(
  organizerPriority: number,
  chair: { priority: number } | null,
): number {
  return chair ? chair.priority : organizerPriority;
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
  /** N's organizer: the only person whose own schedule can block N (v1.12). */
  organizerId: string;
  peopleIds: readonly string[];
}

/** An existing meeting ("E") as loaded by the engine. */
export interface ExistingMeeting extends TimeRange {
  id: string;
  status: MeetingStatus;
  priority: number;
  organizerId: string;
  /** Internal chair (an officer); null when the chair is a guest officer or there is none. */
  chairId: string | null;
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

/**
 * The organizer rule (SPEC.md §6.4, v1.12): N's organizer is the ORGANIZER or the INTERNAL
 * CHAIR of the overlapping meeting E. Priority plays no role. Being only a member of E is not
 * blocking.
 */
export function organizerIsBusy(
  candidateOrganizerId: string,
  meeting: Pick<ExistingMeeting, 'organizerId' | 'chairId'>,
): boolean {
  return (
    meeting.organizerId === candidateOrganizerId ||
    meeting.chairId === candidateOrganizerId
  );
}

export interface Classification<M extends ExistingMeeting> {
  /** Never blocked, whatever the priorities: N is saved, a duplicate-meeting record is kept. */
  warnings: Clash<M>[];
  /** The organizer rule: N must not be saved (409). */
  blocking: Clash<M>[];
}

/**
 * SPEC.md §6.4 (v1.12): the ONLY blocking clash is the organizer rule (`organizerIsBusy`),
 * checked on create and when an edit moves the meeting (`checkOrganizer`). Every other clash
 * (shared officers, chair, members, the organizer as a member elsewhere) is a warning.
 */
export function classifyClashes<M extends ExistingMeeting>(
  candidateOrganizerId: string,
  clashes: readonly Clash<M>[],
  checkOrganizer = true,
): Classification<M> {
  const warnings: Clash<M>[] = [];
  const blocking: Clash<M>[] = [];
  for (const clash of clashes) {
    const busy =
      checkOrganizer && organizerIsBusy(candidateOrganizerId, clash.meeting);
    (busy ? blocking : warnings).push(clash);
  }
  return { warnings, blocking };
}

/**
 * Orientation of a duplicate-meeting record (v1.12): the meeting with the smaller priority
 * number is "higher". On equal priority the existing meeting E stays "higher" and the new or
 * moved meeting N is "lower".
 */
export function candidateIsLower(
  candidatePriority: number,
  existingPriority: number,
): boolean {
  return candidatePriority >= existingPriority;
}

/** Which meeting a conflict notice treats as the recipient's ("lower") meeting. */
export type NoticeSide = 'CANDIDATE' | 'EXISTING';

export interface ConflictNoticeInput {
  candidatePriority: number;
  candidateOrganizerId: string;
  existingPriority: number;
  existingOrganizerId: string;
  /** Shared officers whose duplicate-meeting record is new (already-informed ones are skipped). */
  freshSharedIds: readonly string[];
}

/**
 * Recipients of the informational conflict notice for one clash (SPEC.md §6.4, v1.12), each
 * exactly once (someone with several roles gets one notice):
 * - the organizer of the lower-priority meeting; on equal priority BOTH organizers;
 * - every newly affected shared officer.
 * `side` is the meeting the notice is about for that person: an organizer always reads about
 * their own meeting; a shared officer reads about the record's lower meeting.
 */
export function conflictNoticeRecipients(
  input: ConflictNoticeInput,
): Array<{ userId: string; side: NoticeSide }> {
  const {
    candidatePriority: n,
    existingPriority: e,
    candidateOrganizerId,
    existingOrganizerId,
  } = input;
  const result = new Map<string, NoticeSide>();
  if (n < e || n === e) result.set(existingOrganizerId, 'EXISTING');
  if (n > e || n === e) {
    if (!result.has(candidateOrganizerId))
      result.set(candidateOrganizerId, 'CANDIDATE');
  }
  const recordLower: NoticeSide = candidateIsLower(n, e)
    ? 'CANDIDATE'
    : 'EXISTING';
  for (const id of input.freshSharedIds) {
    if (!result.has(id)) result.set(id, recordLower);
  }
  return [...result].map(([userId, side]) => ({ userId, side }));
}

/** Advisory-lock order: sorted, so two transactions never wait on each other in a cycle. */
export function lockOrder(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}
