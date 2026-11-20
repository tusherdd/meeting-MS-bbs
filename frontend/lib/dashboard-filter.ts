import type { MeetingStatus } from "./types";

/**
 * v1.15 (SPEC.md §13.20): the status filter under the dashboard period tabs.
 * "all" — every meeting of the period (cancelled too); "pending" — SCHEDULED; "complete" — COMPLETED.
 */
export type DashboardFilter = "all" | "pending" | "complete";

export const DASHBOARD_FILTERS: readonly DashboardFilter[] = ["all", "pending", "complete"];

/** The dashboard opens on "pending" (owner decision 2026-11-20). */
export const DEFAULT_DASHBOARD_FILTER: DashboardFilter = "pending";

/** The `status` query value for GET /meetings (undefined = no filter). */
export function statusOfFilter(filter: DashboardFilter): MeetingStatus | undefined {
  return filter === "pending" ? "SCHEDULED" : filter === "complete" ? "COMPLETED" : undefined;
}

/** Client-side filter, for GET /meetings/today (which has no status parameter). */
export function filterMeetings<T extends { status: MeetingStatus }>(
  meetings: readonly T[],
  filter: DashboardFilter,
): T[] {
  const status = statusOfFilter(filter);
  return status ? meetings.filter((m) => m.status === status) : [...meetings];
}
