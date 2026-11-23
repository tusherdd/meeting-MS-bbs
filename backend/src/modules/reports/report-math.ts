/**
 * Pure report aggregation (SPEC.md §6.6). The service loads the meetings of a period; these
 * functions do the counting, so the math is unit-tested without a database.
 *
 * Rules:
 * - A meeting belongs to a period when its START lies in the Dhaka range [start, end).
 * - Hours count SCHEDULED and COMPLETED meetings; CANCELLED meetings do not take time.
 */
import { toDhakaDateString } from '../../common/utils/time';
import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../meetings/enums/participant-role.enum';

export interface ReportMeeting {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  room: string | null;
  status: MeetingStatus;
  organizerId: string;
  organizerNameBn: string;
  organizerNameEn: string;
  organizerDesignationId: string | null;
  organizerDesignationBn: string | null;
  organizerDesignationEn: string | null;
  organizerDesignationPriority: number | null;
  organizerWingId: string | null;
  organizerWingBn: string | null;
  organizerWingEn: string | null;
  /** Role of the report's officer (personal report only). */
  myRole: ParticipantRole | null;
  /** Chair's name: the internal chair, else the guest chair (v1.5); null = no chair. */
  chairNameBn: string | null;
  /** English name of the internal chair; a guest chair's name as typed (v1.7). */
  chairNameEn: string | null;
  /**
   * v1.14: Bangla designation of the chair for the report PDF: the internal chair's designation,
   * else the guest chair's designation as typed; null = no chair.
   */
  chairDesignationBn?: string | null;
  /**
   * Guest officers (v1.5): listed under the meeting, never counted in any statistic
   * (the counts only use organizer and participant rows).
   */
  guests: Array<{ name: string; designation: string }>;
  /** v1.11: number of decision files (for the row menu's "Upload decision"). */
  decisionFileCount?: number;
  /** v1.13: an uploaded notice exists (row menu "সভার নোটিশ"). */
  hasNotice?: boolean;
  /** v1.17: the notice's mime type (row menu "নোটিশ দেখুন" / "নোটিশ ডাউনলোড"). */
  noticeMime?: string | null;
  /** v1.17: a minutes file is PDF / image (row menu "কার্যবিবরণী দেখুন" vs "ডাউনলোড"). */
  decisionViewable?: boolean;
}

export type StatusCounts = Record<MeetingStatus, number>;

export interface DayCount {
  /** YYYY-MM-DD in Asia/Dhaka */
  date: string;
  meetings: number;
  hours: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function meetingHours(
  m: Pick<ReportMeeting, 'startAt' | 'endAt'>,
): number {
  return Math.max(0, m.endAt.getTime() - m.startAt.getTime()) / 3_600_000;
}

const counts = (m: ReportMeeting) => m.status !== MeetingStatus.CANCELLED;

export function statusCounts(meetings: readonly ReportMeeting[]): StatusCounts {
  const result: StatusCounts = {
    [MeetingStatus.SCHEDULED]: 0,
    [MeetingStatus.COMPLETED]: 0,
    [MeetingStatus.CANCELLED]: 0,
  };
  for (const m of meetings) result[m.status]++;
  return result;
}

export function totalHours(meetings: readonly ReportMeeting[]): number {
  return round2(
    meetings.filter(counts).reduce((sum, m) => sum + meetingHours(m), 0),
  );
}

/** Days that have at least one meeting, in date order. */
export function byDay(meetings: readonly ReportMeeting[]): DayCount[] {
  const days = new Map<string, DayCount>();
  for (const m of meetings) {
    const date = toDhakaDateString(m.startAt);
    const day = days.get(date) ?? { date, meetings: 0, hours: 0 };
    day.meetings++;
    if (counts(m)) day.hours += meetingHours(m);
    days.set(date, day);
  }
  return [...days.values()]
    .map((d) => ({ ...d, hours: round2(d.hours) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface PersonalSummary {
  totalMeetings: number;
  organized: number;
  attended: number;
  byStatus: StatusCounts;
  totalHours: number;
  conflictsRaisedAgainstMyMeetings: number;
  conflictsIRaised: number;
  byDay: DayCount[];
}

/** Officer report: `meetings` are those where the officer is one of the people. */
export function personalSummary(
  meetings: readonly ReportMeeting[],
  officerId: string,
  conflicts: { againstMine: number; raisedByMe: number },
): PersonalSummary {
  const organized = meetings.filter((m) => m.organizerId === officerId).length;
  return {
    totalMeetings: meetings.length,
    organized,
    attended: meetings.length - organized,
    byStatus: statusCounts(meetings),
    totalHours: totalHours(meetings),
    conflictsRaisedAgainstMyMeetings: conflicts.againstMine,
    conflictsIRaised: conflicts.raisedByMe,
    byDay: byDay(meetings),
  };
}

export const NO_WING_BN = 'উইং নেই';
export const BUSIEST_DAYS = 5;
