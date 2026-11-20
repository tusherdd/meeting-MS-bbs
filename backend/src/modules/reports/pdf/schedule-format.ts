/**
 * Pure rules of the report PDF "কর্মসূচি" (v1.14, SPEC.md §6.6). The template only prints what
 * these functions return, so every rule is unit-tested without Chromium.
 *
 * - Always Bangla; system numbers (dates, times) in Bangla digits, user text exactly as typed.
 * - Cancelled meetings are not listed; rows are sorted by start time.
 * - "জনাব" is put before every person's name (header and table), never twice.
 * - "মহোদয়" only after the downloading user's designation in the header, and only for
 *   designation priority 1–3. Never in the table.
 */
import { DateTime } from 'luxon';
import { toBanglaDigits } from '../../../common/utils/digits';
import { DHAKA_TZ, type ReportPeriod } from '../../../common/utils/time';
import { NO_VENUE_BN, organizerLabelBn } from '../../meetings/meeting-format';
import { MeetingStatus } from '../../meetings/enums/meeting-status.enum';
import type { ReportMeeting } from '../report-math';

export const ORG_NAME_BN = 'বাংলাদেশ পরিসংখ্যান ব্যুরো';

const SCHEDULE_TYPE_BN: Record<ReportPeriod, string> = {
  day: 'দৈনিক কর্মসূচি',
  week: 'সাপ্তাহিক কর্মসূচি',
  month: 'মাসিক কর্মসূচি',
  year: 'বার্ষিক কর্মসূচি',
};

/**
 * "বাংলাদেশ পরিসংখ্যান ব্যুরো — সাপ্তাহিক কর্মসূচি"; a custom date range (v1.15) is just
 * "বাংলাদেশ পরিসংখ্যান ব্যুরো — কর্মসূচি".
 */
export function scheduleTitleBn(period: ReportPeriod | 'custom'): string {
  if (period === 'custom') return `${ORG_NAME_BN} — কর্মসূচি`;
  return `${ORG_NAME_BN} — ${SCHEDULE_TYPE_BN[period]}`;
}

export const NO_MEETINGS_BN = 'এই সময়ে কোনো সভা নেই।';
export const HONORIFIC_PREFIX_BN = 'জনাব';
export const HONORIFIC_SUFFIX_BN = 'মহোদয়';

/** "জনাব " + name; a name that already starts with "জনাব" is left as it is. */
export function withJanab(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '—';
  if (trimmed.startsWith(HONORIFIC_PREFIX_BN)) return trimmed;
  return `${HONORIFIC_PREFIX_BN} ${trimmed}`;
}

/** Designation priorities that get "মহোদয়" in the header (সচিব, মহাপরিচালক, উপমহাপরিচালক). */
export function takesHonorific(priority: number | null | undefined): boolean {
  return typeof priority === 'number' && priority >= 1 && priority <= 3;
}

/** Header line "পদবি": the designation, plus " মহোদয়" only for priority 1–3. */
export function headerDesignationBn(
  designationBn: string | null | undefined,
  priority: number | null | undefined,
): string {
  const name = designationBn?.trim();
  if (!name) return '—';
  return takesHonorific(priority) ? `${name} ${HONORIFIC_SUFFIX_BN}` : name;
}

/**
 * Part of the day of a Dhaka clock hour:
 * সকাল before 12:00, দুপুর 12:00–14:59, বিকাল 15:00–17:59, সন্ধ্যা 18:00–19:59, রাত from 20:00.
 */
export function dayPartBn(hour: number): string {
  if (hour < 12) return 'সকাল';
  if (hour < 15) return 'দুপুর';
  if (hour < 18) return 'বিকাল';
  if (hour < 20) return 'সন্ধ্যা';
  return 'রাত';
}

const dhaka = (date: Date) => DateTime.fromJSDate(date, { zone: DHAKA_TZ });

/** Start time in Dhaka: day part + "hh.mm" (12-hour clock, two-digit hour, Bangla digits). */
export function scheduleTime(date: Date): { partBn: string; timeBn: string } {
  const d = dhaka(date);
  return {
    partBn: dayPartBn(d.hour),
    timeBn: toBanglaDigits(d.toFormat('hh.mm')),
  };
}

/** Dhaka calendar day: key "yyyy-MM-dd", "dd/mm/yyyy" in Bangla digits and the Bangla weekday. */
export function scheduleDate(date: Date): {
  key: string;
  dateBn: string;
  weekdayBn: string;
} {
  const d = dhaka(date);
  return {
    key: d.toFormat('yyyy-MM-dd'),
    dateBn: toBanglaDigits(d.toFormat('dd/MM/yyyy')),
    weekdayBn: d.setLocale('bn').toFormat('cccc'),
  };
}

export interface ScheduleRow {
  /** Dhaka day "yyyy-MM-dd" (groups rows into one date cell). */
  dateKey: string;
  dateBn: string;
  weekdayBn: string;
  dayPartBn: string;
  timeBn: string;
  /** Meeting title exactly as typed. */
  title: string;
  /** "জনাব <name>" + designation (internal chair or guest chair); null = no chair ("—"). */
  chair: { nameBn: string; designationBn: string | null } | null;
  /** The organizer's Bangla wing, else designation (SPEC.md §13.17). */
  organizerBn: string;
  /** The venue as typed, or "স্থান উল্লেখ নেই". */
  venueBn: string;
}

/** Report meetings → table rows: cancelled meetings left out, sorted by start time. */
export function toScheduleRows(
  meetings: readonly ReportMeeting[],
): ScheduleRow[] {
  return meetings
    .filter((m) => m.status !== MeetingStatus.CANCELLED)
    .slice()
    .sort(
      (a, b) =>
        a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id),
    )
    .map((m) => {
      const day = scheduleDate(m.startAt);
      const time = scheduleTime(m.startAt);
      const chairName = m.chairNameBn?.trim();
      return {
        dateKey: day.key,
        dateBn: day.dateBn,
        weekdayBn: day.weekdayBn,
        dayPartBn: time.partBn,
        timeBn: time.timeBn,
        title: m.title,
        chair: chairName
          ? {
              nameBn: withJanab(chairName),
              designationBn: m.chairDesignationBn?.trim() || null,
            }
          : null,
        organizerBn: organizerLabelBn(
          m.organizerWingBn,
          m.organizerDesignationBn,
        ),
        venueBn: m.room?.trim() || NO_VENUE_BN,
      };
    });
}

/** Consecutive rows of the same day → one group (one date cell with rowspan). */
export function groupByDate<T extends { dateKey: string }>(
  rows: readonly T[],
): T[][] {
  const groups: T[][] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last[0].dateKey === row.dateKey) last.push(row);
    else groups.push([row]);
  }
  return groups;
}

export interface PageLayout {
  /** Height left for the table on the first page (below the header block), in CSS px. */
  firstPage: number;
  /** Height for the table on every later page. */
  otherPages: number;
  /** Height of the table header row, repeated on every page. */
  tableHeader: number;
}

/**
 * Splits rows (by measured height) into pages; returns the row indexes of each page.
 * A row is never split: when it does not fit it starts the next page (a row taller than a
 * whole page gets a page of its own). Every page starts with the table header.
 */
export function paginateRows(
  rowHeights: readonly number[],
  layout: PageLayout,
): number[][] {
  const pages: number[][] = [];
  let current: number[] = [];
  let room = layout.firstPage - layout.tableHeader;
  rowHeights.forEach((height, index) => {
    if (current.length > 0 && height > room) {
      pages.push(current);
      current = [];
      room = layout.otherPages - layout.tableHeader;
    }
    current.push(index);
    room -= height;
  });
  if (current.length > 0) pages.push(current);
  return pages;
}
