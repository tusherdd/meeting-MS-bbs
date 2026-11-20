import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { toBanglaDigits } from '../../common/utils/digits';
import {
  DHAKA_TZ,
  getPeriodRange,
  toDhakaDateString,
  type DateRange,
  type ReportPeriod,
} from '../../common/utils/time';

/** A fixed period, or (v1.15) a custom date range chosen with "শুরুর তারিখ" / "শেষ তারিখ". */
export type ReportRangeKind = ReportPeriod | 'custom';

export interface ResolvedPeriod {
  period: ReportRangeKind;
  /** The reference day (YYYY-MM-DD, Dhaka); for a custom range its first day. */
  date: string;
  range: DateRange;
  /** Bangla label, e.g. "ডিসেম্বর ২০২৬". */
  labelBn: string;
  /** Safe file-name part, e.g. "2026-12". */
  fileKey: string;
}

const bn = (d: DateTime) => d.setLocale('bn');

/**
 * Period → Dhaka range [start, end) via common/utils/time (SPEC.md §6.6) plus Bangla label and
 * a file-name key. `date` defaults to today in Dhaka.
 */
export function resolvePeriod(
  period: ReportPeriod,
  date?: string,
  now = new Date(),
): ResolvedPeriod {
  const day = date ?? toDhakaDateString(now);
  let range: DateRange;
  try {
    range = getPeriodRange(period, day);
  } catch {
    throw new BadRequestException('সঠিক তারিখ দিন (YYYY-MM-DD)।');
  }
  const start = DateTime.fromJSDate(range.start, { zone: DHAKA_TZ });
  const lastDay = DateTime.fromJSDate(range.end, { zone: DHAKA_TZ }).minus({
    days: 1,
  });

  let labelBn: string;
  let fileKey: string;
  switch (period) {
    case 'day':
      labelBn = bn(start).toFormat('d MMMM yyyy (cccc)');
      fileKey = start.toFormat('yyyy-MM-dd');
      break;
    case 'week':
      labelBn = `${bn(start).toFormat('d MMMM')} – ${bn(lastDay).toFormat('d MMMM yyyy')} (সপ্তাহ)`;
      fileKey = `week-${start.toFormat('yyyy-MM-dd')}`;
      break;
    case 'month':
      labelBn = bn(start).toFormat('MMMM yyyy');
      fileKey = start.toFormat('yyyy-MM');
      break;
    case 'year':
      labelBn = `${toBanglaDigits(start.year)} সাল`;
      fileKey = String(start.year);
      break;
  }
  return { period, date: day, range, labelBn, fileKey };
}

// ------------------------------------------------------------------ custom range (v1.15)

/** At most two years: the last day is before the same day two years later. */
export const MAX_RANGE_YEARS = 2;

export const RANGE_MESSAGES_BN = {
  incomplete: 'শুরুর তারিখ ও শেষ তারিখ দুটোই দিন।',
  endBeforeStart: 'শেষ তারিখ শুরুর তারিখের আগে হতে পারে না।',
  tooLong: 'সময়কাল সর্বোচ্চ ২ বছর হতে পারে।',
} as const;

export type RangeProblem = keyof typeof RANGE_MESSAGES_BN;

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

function plainDay(value: string): DateTime | null {
  if (!PLAIN_DATE.test(value)) return null;
  const d = DateTime.fromISO(value, { zone: DHAKA_TZ });
  return d.isValid ? d.startOf('day') : null;
}

/**
 * Rules of a custom range (the frontend's `lib/report-range.ts` mirrors them): both dates, the end
 * not before the start, both days inclusive, at most 2 years (2025-01-01 – 2026-12-31 is fine,
 * 2025-01-01 – 2027-01-01 is not). Returns the problem or null. Invalid dates → 'incomplete'.
 */
export function validateRange(from?: string, to?: string): RangeProblem | null {
  const start = from ? plainDay(from) : null;
  const end = to ? plainDay(to) : null;
  if (!start || !end) return 'incomplete';
  if (end < start) return 'endBeforeStart';
  if (end >= start.plus({ years: MAX_RANGE_YEARS })) return 'tooLong';
  return null;
}

/**
 * Custom range [from, to] (YYYY-MM-DD, Dhaka, both days inclusive) → half-open UTC range
 * [from 00:00, the day after `to` 00:00). Label "১ নভেম্বর ২০২৬ – ১৫ ডিসেম্বর ২০২৬".
 */
export function resolveRange(from?: string, to?: string): ResolvedPeriod {
  const problem = validateRange(from, to);
  if (problem) throw new BadRequestException(RANGE_MESSAGES_BN[problem]);
  const start = plainDay(from as string) as DateTime;
  const last = plainDay(to as string) as DateTime;
  return {
    period: 'custom',
    date: start.toFormat('yyyy-MM-dd'),
    range: {
      start: start.toUTC().toJSDate(),
      end: last.plus({ days: 1 }).toUTC().toJSDate(),
    },
    labelBn: `${bn(start).toFormat('d MMMM yyyy')} – ${bn(last).toFormat('d MMMM yyyy')}`,
    fileKey: `${start.toFormat('yyyy-MM-dd')}_${last.toFormat('yyyy-MM-dd')}`,
  };
}

export interface ReportRangeQuery {
  period: ReportPeriod;
  date?: string;
  from?: string;
  to?: string;
}

/** The report query: `from` / `to` (custom range) win over `period` / `date` when either is given. */
export function resolveReportQuery(q: ReportRangeQuery): ResolvedPeriod {
  if (q.from !== undefined || q.to !== undefined)
    return resolveRange(q.from, q.to);
  return resolvePeriod(q.period, q.date);
}
