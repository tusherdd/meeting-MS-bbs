/**
 * Asia/Dhaka calendar helpers.
 *
 * Rule (CLAUDE.md): store UTC `timestamptz`, but decide what "today / this week / this month"
 * means in Asia/Dhaka. Every range here is half-open — [start, end) — and returned as UTC
 * `Date`s, ready for queries like `startAt >= :start AND startAt < :end`.
 */
import { DateTime } from 'luxon';

export const DHAKA_TZ = 'Asia/Dhaka';

export const REPORT_PERIODS = [
  'day',
  'week',
  'month',
  'year',
  'fiscal-year',
] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** Half-open range: start is included, end is excluded. */
export interface DateRange {
  start: Date;
  end: Date;
}

/** Fiscal year in Bangladesh starts on 1 July. */
const FISCAL_YEAR_START_MONTH = 7;

/**
 * Converts input to a luxon DateTime in Asia/Dhaka.
 * - `Date`: an exact instant.
 * - `string`: ISO 8601. A date-only string like "2026-11-08" means that calendar day in Dhaka;
 *   a string with an offset ("...Z", "+06:00") is an exact instant.
 * - omitted: now.
 * Throws RangeError for invalid input.
 */
export function toDhakaDateTime(input: Date | string = new Date()): DateTime {
  const dt =
    typeof input === 'string'
      ? DateTime.fromISO(input, { zone: DHAKA_TZ })
      : DateTime.fromJSDate(input, { zone: DHAKA_TZ });
  if (!dt.isValid) {
    throw new RangeError(`Invalid date: ${String(input)}`);
  }
  return dt;
}

function toRange(start: DateTime, end: DateTime): DateRange {
  return { start: start.toUTC().toJSDate(), end: end.toUTC().toJSDate() };
}

export function getDayRange(input?: Date | string): DateRange {
  const start = toDhakaDateTime(input).startOf('day');
  return toRange(start, start.plus({ days: 1 }));
}

/** Office week: Sunday to Saturday. */
export function getWeekRange(input?: Date | string): DateRange {
  const day = toDhakaDateTime(input).startOf('day');
  // luxon weekday: 1 = Monday ... 7 = Sunday, so `% 7` gives days since Sunday.
  const start = day.minus({ days: day.weekday % 7 });
  return toRange(start, start.plus({ weeks: 1 }));
}

export function getMonthRange(input?: Date | string): DateRange {
  const start = toDhakaDateTime(input).startOf('month');
  return toRange(start, start.plus({ months: 1 }));
}

/** Calendar year: January to December. */
export function getYearRange(input?: Date | string): DateRange {
  const start = toDhakaDateTime(input).startOf('year');
  return toRange(start, start.plus({ years: 1 }));
}

/** Fiscal year: 1 July to 30 June. */
export function getFiscalYearRange(input?: Date | string): DateRange {
  const dt = toDhakaDateTime(input);
  const startYear = dt.month >= FISCAL_YEAR_START_MONTH ? dt.year : dt.year - 1;
  const start = DateTime.fromObject(
    { year: startYear, month: FISCAL_YEAR_START_MONTH, day: 1 },
    { zone: DHAKA_TZ },
  );
  return toRange(start, start.plus({ years: 1 }));
}

export function getPeriodRange(
  period: ReportPeriod,
  input?: Date | string,
): DateRange {
  switch (period) {
    case 'day':
      return getDayRange(input);
    case 'week':
      return getWeekRange(input);
    case 'month':
      return getMonthRange(input);
    case 'year':
      return getYearRange(input);
    case 'fiscal-year':
      return getFiscalYearRange(input);
    default: {
      const unknownPeriod: never = period;
      throw new RangeError(`Unknown period: ${String(unknownPeriod)}`);
    }
  }
}

/** Calendar date ("YYYY-MM-DD") of an instant, as seen in Dhaka. */
export function toDhakaDateString(input: Date | string = new Date()): string {
  return toDhakaDateTime(input).toISODate() as string; // always set for a valid DateTime
}
