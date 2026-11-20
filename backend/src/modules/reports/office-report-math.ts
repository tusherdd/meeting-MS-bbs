/**
 * v1.15 office report "অফিস রিপোর্ট" (SPEC.md §6.10): pure counting, unit-tested in
 * office-report-math.spec.ts. The service loads the meetings of the report's scope and period
 * (by START time, Asia/Dhaka) with their officer rows; these functions do the rest.
 *
 * - Cards: all statuses (cancelled too); hours without cancelled meetings.
 * - Wing list: meetings counted by the ORGANIZER's wing.
 * - Top 5 participants: every role (organizer, internal chair, member), cancelled meetings excluded;
 *   optionally only officers of one wing.
 * - Busiest 5 days: the existing rule (byDay over the meetings, most meetings first).
 */
import { MeetingStatus } from '../meetings/enums/meeting-status.enum';
import { ParticipantRole } from '../meetings/enums/participant-role.enum';
import {
  BUSIEST_DAYS,
  NO_WING_BN,
  byDay,
  meetingHours,
  totalHours,
  type DayCount,
  type ReportMeeting,
} from './report-math';

export interface OfficePerson {
  userId: string;
  role: ParticipantRole;
  nameBn: string;
  nameEn: string;
  designationBn: string | null;
  designationEn: string | null;
  wingId: string | null;
  wingBn: string | null;
  wingEn: string | null;
}

export interface OfficeMeeting extends ReportMeeting {
  /** Internal chair (an officer) or null. */
  chairId: string | null;
  /** English designation of the chair (internal: the designation's English name; guest: as typed). */
  chairDesignationEn: string | null;
  /** "user:<id>" or "guest:<name>" — the value of the সভাপতি filter; null = no chair. */
  chairKey: string | null;
  /** The meeting's officers (organizer, internal chair, members). Guests are never counted. */
  people: OfficePerson[];
}

export const TOP_PARTICIPANTS = 5;

const round2 = (n: number) => Math.round(n * 100) / 100;
const notCancelled = (m: ReportMeeting) => m.status !== MeetingStatus.CANCELLED;

export interface OfficeCards {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  hours: number;
}

export function officeCards(meetings: readonly ReportMeeting[]): OfficeCards {
  const of = (s: MeetingStatus) =>
    meetings.filter((m) => m.status === s).length;
  return {
    total: meetings.length,
    scheduled: of(MeetingStatus.SCHEDULED),
    completed: of(MeetingStatus.COMPLETED),
    cancelled: of(MeetingStatus.CANCELLED),
    hours: totalHours(meetings),
  };
}

export interface WingRow {
  id: string | null;
  nameBn: string;
  nameEn: string | null;
  meetings: number;
  completed: number;
  cancelled: number;
  hours: number;
}

/** "উইংভিত্তিক তালিকা": by the organizer's wing, most meetings first. */
export function wingRows(meetings: readonly ReportMeeting[]): WingRow[] {
  const rows = new Map<string, WingRow>();
  for (const m of meetings) {
    const key = m.organizerWingId ?? '∅';
    const row = rows.get(key) ?? {
      id: m.organizerWingId,
      nameBn: m.organizerWingBn ?? NO_WING_BN,
      nameEn: m.organizerWingEn,
      meetings: 0,
      completed: 0,
      cancelled: 0,
      hours: 0,
    };
    row.meetings++;
    if (m.status === MeetingStatus.COMPLETED) row.completed++;
    if (m.status === MeetingStatus.CANCELLED) row.cancelled++;
    else row.hours += meetingHours(m);
    rows.set(key, row);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, hours: round2(r.hours) }))
    .sort(
      (a, b) => b.meetings - a.meetings || a.nameBn.localeCompare(b.nameBn),
    );
}

export interface ParticipantRow {
  userId: string;
  nameBn: string;
  nameEn: string;
  designationBn: string | null;
  designationEn: string | null;
  wingBn: string | null;
  wingEn: string | null;
  meetings: number;
  hours: number;
}

/**
 * "শীর্ষ ৫ অংশগ্রহণকারী": officers by the number of (not cancelled) meetings they take part in, in any
 * role; ties by hours, then name. `onlyWingId` keeps officers of that wing only (WING viewers).
 */
export function topParticipants(
  meetings: readonly OfficeMeeting[],
  onlyWingId: string | null = null,
  limit = TOP_PARTICIPANTS,
): ParticipantRow[] {
  const rows = new Map<string, ParticipantRow>();
  for (const m of meetings.filter(notCancelled)) {
    const hours = meetingHours(m);
    const seen = new Set<string>();
    for (const p of m.people) {
      if (seen.has(p.userId)) continue;
      seen.add(p.userId);
      if (onlyWingId && p.wingId !== onlyWingId) continue;
      const row = rows.get(p.userId) ?? {
        userId: p.userId,
        nameBn: p.nameBn,
        nameEn: p.nameEn,
        designationBn: p.designationBn,
        designationEn: p.designationEn,
        wingBn: p.wingBn,
        wingEn: p.wingEn,
        meetings: 0,
        hours: 0,
      };
      row.meetings++;
      row.hours += hours;
      rows.set(p.userId, row);
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, hours: round2(r.hours) }))
    .sort(
      (a, b) =>
        b.meetings - a.meetings ||
        b.hours - a.hours ||
        a.nameBn.localeCompare(b.nameBn),
    )
    .slice(0, limit);
}

/** "সবচেয়ে ব্যস্ত ৫ দিন" — unchanged rule (most meetings first, then the earlier day). */
export function busiestDays(meetings: readonly ReportMeeting[]): DayCount[] {
  return byDay(meetings)
    .sort((a, b) => b.meetings - a.meetings || a.date.localeCompare(b.date))
    .slice(0, BUSIEST_DAYS);
}

/** Role of an officer in a meeting (their highest: organizer, then chair, then member). */
export function roleOf(
  m: OfficeMeeting,
  userId: string,
): ParticipantRole | null {
  const roles = new Set(
    m.people.filter((p) => p.userId === userId).map((p) => p.role),
  );
  if (m.organizerId === userId || roles.has(ParticipantRole.ORGANIZER))
    return ParticipantRole.ORGANIZER;
  if (m.chairId === userId || roles.has(ParticipantRole.CHAIR))
    return ParticipantRole.CHAIR;
  return roles.has(ParticipantRole.MEMBER) ? ParticipantRole.MEMBER : null;
}

export interface ListFilter {
  status?: MeetingStatus;
  /** "আয়োজক উইং" (OFFICE only). */
  organizerWingId?: string;
  /** "সভাপতি": a chairKey. */
  chair?: string;
  /** "ভূমিকা" of the selected officer (only with an officer). */
  role?: ParticipantRole;
}

/** "সভার তালিকা" filters, applied after the cards and tables are counted. */
export function filterMeetings(
  meetings: readonly OfficeMeeting[],
  filter: ListFilter,
  officerId: string | null,
): OfficeMeeting[] {
  return meetings.filter(
    (m) =>
      (!filter.status || m.status === filter.status) &&
      (!filter.organizerWingId ||
        m.organizerWingId === filter.organizerWingId) &&
      (!filter.chair || m.chairKey === filter.chair) &&
      (!filter.role || !officerId || roleOf(m, officerId) === filter.role),
  );
}

export interface ChairOption {
  key: string;
  nameBn: string;
  nameEn: string;
  designationBn: string | null;
  designationEn: string | null;
}

/** Options of the "সভাপতি" filter: every chair of the meetings, by name. */
export function chairOptions(
  meetings: readonly OfficeMeeting[],
): ChairOption[] {
  const options = new Map<string, ChairOption>();
  for (const m of meetings) {
    if (!m.chairKey || options.has(m.chairKey)) continue;
    options.set(m.chairKey, {
      key: m.chairKey,
      nameBn: m.chairNameBn ?? '—',
      nameEn: m.chairNameEn ?? m.chairNameBn ?? '—',
      designationBn: m.chairDesignationBn ?? null,
      designationEn: m.chairDesignationEn,
    });
  }
  return [...options.values()].sort((a, b) => a.nameBn.localeCompare(b.nameBn));
}

export interface WingOption {
  id: string;
  nameBn: string;
  nameEn: string | null;
}

/** Options of the "আয়োজক উইং" filter: the organizers' wings of the meetings. */
export function organizerWingOptions(
  meetings: readonly ReportMeeting[],
): WingOption[] {
  const options = new Map<string, WingOption>();
  for (const m of meetings) {
    if (!m.organizerWingId || options.has(m.organizerWingId)) continue;
    options.set(m.organizerWingId, {
      id: m.organizerWingId,
      nameBn: m.organizerWingBn ?? NO_WING_BN,
      nameEn: m.organizerWingEn,
    });
  }
  return [...options.values()].sort((a, b) => a.nameBn.localeCompare(b.nameBn));
}
