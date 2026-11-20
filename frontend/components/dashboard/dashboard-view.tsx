"use client";

import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type KeyboardEvent } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/spinner";

import {
  DASHBOARD_FILTERS,
  DEFAULT_DASHBOARD_FILTER,
  filterMeetings,
  statusOfFilter,
  type DashboardFilter,
} from "@/lib/dashboard-filter";
import { meetingsApi, queryKeys } from "@/lib/endpoints";
import { monthRange, weekRange, type DateRange } from "@/lib/time";
import type { MeetingSummary } from "@/lib/types";
import { useFormat, useNames, useT } from "@/providers/locale-provider";
import { useCurrentUser } from "@/providers/auth-provider";
import { ConflictWarning } from "./conflict-warning";
import { MeetingList } from "./meeting-list";
import { SummaryRow } from "./summary-row";

type Tab = "today" | "week" | "month";
const TABS: Tab[] = ["today", "week", "month"];
/** Week / month lists: one page of up to 100 meetings (backend maximum). */
const RANGE_LIMIT = 100;

/**
 * Today: GET /meetings/today has no status parameter → filtered here. Week / month: the status
 * filter goes to the server (GET /meetings?status=…), so the 100-row page holds only matches.
 */
function useTabMeetings(tab: Tab, range: DateRange | null, filter: DashboardFilter) {
  const status = statusOfFilter(filter);
  const today = useQuery({
    queryKey: queryKeys.meetingsToday,
    queryFn: meetingsApi.today,
    enabled: tab === "today",
    select: (list: MeetingSummary[]) => filterMeetings(list, filter),
  });
  const ranged = useQuery({
    queryKey: queryKeys.meetingsRange(range?.from ?? "", range?.to ?? "", status),
    queryFn: async (): Promise<MeetingSummary[]> =>
      (
        await meetingsApi.list({
          from: range!.from,
          to: range!.to,
          limit: RANGE_LIMIT,
          ...(status ? { status } : {}),
        })
      ).items,
    enabled: tab !== "today" && range !== null,
  });
  return tab === "today" ? today : ranged;
}

export function DashboardView() {
  const t = useT();
  const names = useNames();
  const { formatDateWithWeekday } = useFormat();
  const user = useCurrentUser();
  const [tab, setTab] = useState<Tab>("today");
  // Kept when the period tab changes.
  const [filter, setFilter] = useState<DashboardFilter>(DEFAULT_DASHBOARD_FILTER);
  const range = useMemo(
    () => (tab === "week" ? weekRange() : tab === "month" ? monthRange() : null),
    [tab],
  );

  const meetings = useTabMeetings(tab, range, filter);
  const conflicts = useQuery({
    queryKey: queryKeys.myConflicts,
    queryFn: () => meetingsApi.myConflicts(),
  });

  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of conflicts.data ?? []) {
      if (c.status !== "PENDING") continue;
      ids.add(c.lowerMeeting.id);
      ids.add(c.higherMeeting.id);
    }
    return ids;
  }, [conflicts.data]);

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = TABS.indexOf(tab);
    const next =
      e.key === "ArrowRight"
        ? TABS[(i + 1) % TABS.length]
        : e.key === "ArrowLeft"
          ? TABS[(i + TABS.length - 1) % TABS.length]
          : null;
    if (next) {
      e.preventDefault();
      setTab(next);
      document.getElementById(`tab-${next}`)?.focus();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t.dashboard.title}</h1>
          <p className="mt-1 text-slate-600">
            {t.dashboard.greeting(names.of(user))} · {formatDateWithWeekday(new Date())}
          </p>
        </div>
        <LinkButton href="/meetings/new">{t.dashboard.newMeeting}</LinkButton>
      </div>

      {conflicts.isError ? (
        <ErrorAlert error={conflicts.error} onRetry={() => void conflicts.refetch()} />
      ) : (
        conflicts.data && <ConflictWarning conflicts={conflicts.data} />
      )}

      <SummaryRow />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 pt-3 sm:px-5">
          <h2 className="pb-3 text-base font-semibold text-slate-900">{t.dashboard.meetingsOf}</h2>
          <div role="tablist" aria-label={t.dashboard.meetingsOf} className="flex gap-1">
            {TABS.map((key) => (
              <button
                key={key}
                id={`tab-${key}`}
                type="button"
                role="tab"
                aria-selected={tab === key}
                aria-controls="meetings-panel"
                tabIndex={tab === key ? 0 : -1}
                onClick={() => setTab(key)}
                onKeyDown={onTabKey}
                className={clsx(
                  "-mb-px border-b-2 px-3 pb-3 text-sm font-medium",
                  tab === key
                    ? "border-brand-700 text-brand-800"
                    : "border-transparent text-slate-600 hover:text-slate-900",
                )}
              >
                {t.dashboard.tabs[key]}
              </button>
            ))}
          </div>
        </div>
        <div id="meetings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
          <div
            role="group"
            aria-label={t.dashboard.filterLabel}
            className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3 sm:px-5"
            data-testid="dashboard-filter"
          >
            {DASHBOARD_FILTERS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={clsx(
                  "rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
                  filter === key
                    ? "border-brand-700 bg-brand-700 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                {t.dashboard.filters[key]}
              </button>
            ))}
          </div>
          {meetings.isPending ? (
            <LoadingBlock />
          ) : meetings.isError ? (
            <div className="p-4">
              <ErrorAlert error={meetings.error} onRetry={() => void meetings.refetch()} />
            </div>
          ) : meetings.data.length === 0 ? (
            <EmptyState
              title={
                {
                  today: t.dashboard.emptyToday,
                  week: t.dashboard.emptyWeek,
                  month: t.dashboard.emptyMonth,
                }[tab]
              }
              action={
                <LinkButton href="/meetings/new" variant="secondary" size="sm">
                  {t.dashboard.newMeeting}
                </LinkButton>
              }
            />
          ) : (
            <MeetingList
              meetings={meetings.data}
              conflictIds={conflictIds}
              showDate={tab !== "today"}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
