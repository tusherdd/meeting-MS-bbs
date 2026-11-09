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
  organizerDesignationId: string | null;
  organizerDesignationBn: string | null;
  organizerDesignationPriority: number | null;
  organizerWingId: string | null;
  organizerWingBn: string | null;
  /** Role of the report's officer (personal report only). */
  myRole: ParticipantRole | null;
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

export interface GroupCount {
  id: string | null;
  nameBn: string;
  meetings: number;
  hours: number;
}

export interface OrganizerCount {
  userId: string;
  nameBn: string;
  designationBn: string | null;
  meetings: number;
  hours: number;
}

export interface OfficeBreakdown {
  totalMeetings: number;
  byStatus: StatusCounts;
  totalHours: number;
  byWing: GroupCount[];
  byDesignation: Array<GroupCount & { priority: number | null }>;
  topOrganizers: OrganizerCount[];
  busiestDays: DayCount[];
}

export const NO_WING_BN = 'উইং নেই';
export const TOP_ORGANIZERS = 10;
export const BUSIEST_DAYS = 5;

function group<T extends GroupCount>(
  meetings: readonly ReportMeeting[],
  key: (m: ReportMeeting) => string | null,
  make: (m: ReportMeeting) => T,
): T[] {
  const groups = new Map<string, T>();
  for (const m of meetings) {
    const k = key(m) ?? '∅';
    const g = groups.get(k) ?? make(m);
    g.meetings++;
    if (counts(m)) g.hours += meetingHours(m);
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => ({ ...g, hours: round2(g.hours) }));
}

/** Office report: grouped by the ORGANIZER's wing and designation. */
export function officeBreakdown(
  meetings: readonly ReportMeeting[],
): OfficeBreakdown {
  const byWing = group(
    meetings,
    (m) => m.organizerWingId,
    (m) => ({
      id: m.organizerWingId,
      nameBn: m.organizerWingBn ?? NO_WING_BN,
      meetings: 0,
      hours: 0,
    }),
  ).sort((a, b) => b.meetings - a.meetings || a.nameBn.localeCompare(b.nameBn));

  const byDesignation = group(
    meetings,
    (m) => m.organizerDesignationId,
    (m) => ({
      id: m.organizerDesignationId,
      nameBn: m.organizerDesignationBn ?? '—',
      priority: m.organizerDesignationPriority,
      meetings: 0,
      hours: 0,
    }),
  ).sort(
    (a, b) =>
      (a.priority ?? 999) - (b.priority ?? 999) ||
      a.nameBn.localeCompare(b.nameBn),
  );

  const organizers = new Map<string, OrganizerCount>();
  for (const m of meetings) {
    const o = organizers.get(m.organizerId) ?? {
      userId: m.organizerId,
      nameBn: m.organizerNameBn,
      designationBn: m.organizerDesignationBn,
      meetings: 0,
      hours: 0,
    };
    o.meetings++;
    if (counts(m)) o.hours += meetingHours(m);
    organizers.set(m.organizerId, o);
  }
  const topOrganizers = [...organizers.values()]
    .map((o) => ({ ...o, hours: round2(o.hours) }))
    .sort(
      (a, b) =>
        b.meetings - a.meetings ||
        b.hours - a.hours ||
        a.nameBn.localeCompare(b.nameBn),
    )
    .slice(0, TOP_ORGANIZERS);

  const busiestDays = byDay(meetings)
    .sort((a, b) => b.meetings - a.meetings || a.date.localeCompare(b.date))
    .slice(0, BUSIEST_DAYS);

  return {
    totalMeetings: meetings.length,
    byStatus: statusCounts(meetings),
    totalHours: totalHours(meetings),
    byWing,
    byDesignation,
    topOrganizers,
    busiestDays,
  };
}
