/**
 * v1.15: what a report shows — a fixed period (period + reference date) or a custom date range
 * chosen with "শুরুর তারিখ" / "শেষ তারিখ". The range rules mirror the backend
 * (`reports/report-period.ts` validateRange): both dates, the end not before the start, both days
 * inclusive (Asia/Dhaka calendar dates), at most 2 years. The backend checks them again.
 */
import { isPlainDate, periodDays } from "./report-period";
import type { ReportPeriod } from "./types";

export type ReportWhen =
  | { kind: "period"; period: ReportPeriod; date: string }
  | { kind: "range"; from: string; to: string };

export const MAX_RANGE_YEARS = 2;

export type RangeProblem = "incomplete" | "endBeforeStart" | "tooLong";

/** `date` plus whole years, like luxon: 29 February becomes 28 February in a common year. */
export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y + years}-${pad(m)}-${pad(Math.min(d, lastDay))}`;
}

export function validateRange(from: string, to: string): RangeProblem | null {
  if (!isPlainDate(from) || !isPlainDate(to)) return "incomplete";
  if (to < from) return "endBeforeStart";
  if (to >= addYears(from, MAX_RANGE_YEARS)) return "tooLong";
  return null;
}

/** First and last day (both inclusive) the report covers. */
export function whenDays(when: ReportWhen): { first: string; last: string } {
  return when.kind === "range"
    ? { first: when.from, last: when.to }
    : periodDays(when.period, when.date);
}

/** Query parameters for the report API. */
export function whenQuery(
  when: ReportWhen,
): { period: ReportPeriod; date: string } | { from: string; to: string } {
  return when.kind === "range"
    ? { from: when.from, to: when.to }
    : { period: when.period, date: when.date };
}

/** Stable part of a React Query key. */
export function whenKey(when: ReportWhen): readonly string[] {
  return when.kind === "range" ? ["range", when.from, when.to] : ["period", when.period, when.date];
}

/** Name part for a fallback PDF file name. */
export function whenFileKey(when: ReportWhen): string {
  return when.kind === "range" ? `${when.from}_${when.to}` : when.date;
}
