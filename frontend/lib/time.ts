/**
 * Asia/Dhaka date ranges, the same rules as the backend (common/utils/time):
 * day = 00:00–24:00, week = Sunday–Saturday, month = 1st–last day. Ranges are [from, to).
 */
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const DHAKA_TZ = "Asia/Dhaka";

export interface DateRange {
  /** Inclusive start, ISO string (UTC). */
  from: string;
  /** Exclusive end, ISO string (UTC). */
  to: string;
}

/** Today's calendar date in Dhaka, "YYYY-MM-DD". */
export function dhakaToday(now = new Date()): string {
  return formatInTimeZone(now, DHAKA_TZ, "yyyy-MM-dd");
}

/** Plain calendar arithmetic on "YYYY-MM-DD" (no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 00:00 of a Dhaka calendar date, as an ISO instant. */
export function dhakaMidnight(date: string): string {
  return fromZonedTime(`${date}T00:00:00`, DHAKA_TZ).toISOString();
}

export function dayRange(now = new Date()): DateRange {
  const today = dhakaToday(now);
  return { from: dhakaMidnight(today), to: dhakaMidnight(addDays(today, 1)) };
}

export function weekRange(now = new Date()): DateRange {
  const today = dhakaToday(now);
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const sunday = addDays(today, -weekday);
  return { from: dhakaMidnight(sunday), to: dhakaMidnight(addDays(sunday, 7)) };
}

export function monthRange(now = new Date()): DateRange {
  const { first, next } = monthBounds(dhakaToday(now));
  return { from: dhakaMidnight(first), to: dhakaMidnight(next) };
}

/** 0 = Sunday … 6 = Saturday for a "YYYY-MM-DD" calendar date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Sunday of the week that contains `date`. */
export function sundayOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

/** First day of the month of `date`, and of the next month ("YYYY-MM-01"). */
export function monthBounds(date: string): { first: string; next: string } {
  const [y, m] = date.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { first, next };
}

/** Whole Dhaka days [fromDate, toDate] (both inclusive) as an API range [from, to). */
export function dateRangeToIso(fromDate: string, toDate: string): DateRange {
  return { from: dhakaMidnight(fromDate), to: dhakaMidnight(addDays(toDate, 1)) };
}
