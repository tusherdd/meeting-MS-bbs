/**
 * Report periods (SPEC.md §6.6), the same rules as the backend (common/utils/time):
 * day, week (Sunday–Saturday), month, year (Jan–Dec), fiscal-year (July–June), all in Asia/Dhaka.
 * Dates here are plain calendar dates "YYYY-MM-DD" (no time zone involved).
 */
import { addDays, dhakaToday, monthBounds, sundayOf } from "./time";
import type { ReportPeriod } from "./types";

export const REPORT_PERIODS: readonly ReportPeriod[] = [
  "day",
  "week",
  "month",
  "year",
  "fiscal-year",
] as const;

export function isReportPeriod(value: string | null | undefined): value is ReportPeriod {
  return !!value && (REPORT_PERIODS as readonly string[]).includes(value);
}

export function isPlainDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** First calendar day of the period that contains `date`. */
export function periodStart(period: ReportPeriod, date: string): string {
  const [y, m] = date.split("-").map(Number);
  switch (period) {
    case "day":
      return date;
    case "week":
      return sundayOf(date);
    case "month":
      return monthBounds(date).first;
    case "year":
      return `${y}-01-01`;
    case "fiscal-year":
      return `${m >= 7 ? y : y - 1}-07-01`;
  }
}

/** Calendar days [first, last] (both inclusive) of the period that contains `date`. */
export function periodDays(period: ReportPeriod, date: string): { first: string; last: string } {
  const first = periodStart(period, date);
  const next = shiftPeriod(period, first, 1);
  return { first, last: addDays(next, -1) };
}

/** The same period one step earlier (-1) or later (+1); the result is the period's first day. */
export function shiftPeriod(period: ReportPeriod, date: string, step: -1 | 1): string {
  const start = periodStart(period, date);
  const [y, m] = start.split("-").map(Number);
  switch (period) {
    case "day":
      return addDays(start, step);
    case "week":
      return addDays(start, 7 * step);
    case "month": {
      const total = y * 12 + (m - 1) + step;
      return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
    }
    case "year":
    case "fiscal-year":
      return `${y + step}-${pad(m)}-01`;
  }
}

/** Does the period contain today (Dhaka)? */
export function containsToday(period: ReportPeriod, date: string, now = new Date()): boolean {
  const { first, last } = periodDays(period, date);
  const today = dhakaToday(now);
  return first <= today && today <= last;
}

export interface ChartBar {
  key: string;
  /** "YYYY-MM-DD" (one day) or "YYYY-MM" (one month). */
  label: string;
  meetings: number;
  hours: number;
}

/**
 * Bars for the meetings-per-day chart. Day/week/month: one bar per day (days without meetings
 * show 0). Year/fiscal-year: one bar per month (365 bars would be unreadable).
 */
export function chartBars(
  period: ReportPeriod,
  date: string,
  byDay: readonly { date: string; meetings: number; hours: number }[],
): { unit: "day" | "month"; bars: ChartBar[] } {
  const { first, last } = periodDays(period, date);
  if (period === "year" || period === "fiscal-year") {
    const months = new Map<string, ChartBar>();
    for (let d = first; d <= last; d = shiftPeriod("month", d, 1)) {
      const key = d.slice(0, 7);
      months.set(key, { key, label: key, meetings: 0, hours: 0 });
    }
    for (const day of byDay) {
      const bar = months.get(day.date.slice(0, 7));
      if (bar) {
        bar.meetings += day.meetings;
        bar.hours = Math.round((bar.hours + day.hours) * 100) / 100;
      }
    }
    return { unit: "month", bars: [...months.values()] };
  }
  const counts = new Map(byDay.map((d) => [d.date, d]));
  const bars: ChartBar[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const found = counts.get(d);
    bars.push({ key: d, label: d, meetings: found?.meetings ?? 0, hours: found?.hours ?? 0 });
  }
  return { unit: "day", bars };
}
