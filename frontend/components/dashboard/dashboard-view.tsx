"use client";

import clsx from "clsx";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type KeyboardEvent } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/spinner";
import { formatDateWithWeekday } from "@/lib/format";
import { meetingsApi, queryKeys } from "@/lib/endpoints";
import { monthRange, weekRange, type DateRange } from "@/lib/time";
import type { MeetingSummary } from "@/lib/types";
import { t } from "@/messages";
import { useCurrentUser } from "@/providers/auth-provider";
import { ConflictWarning } from "./conflict-warning";
import { MeetingList } from "./meeting-list";
import { SummaryRow } from "./summary-row";

type Tab = "today" | "week" | "month";
const TABS: Tab[] = ["today", "week", "month"];
/** Week / month lists: one page of up to 100 meetings (backend maximum). */
const RANGE_LIMIT = 100;

const emptyText: Record<Tab, string> = {
  today: t.dashboard.emptyToday,
  week: t.dashboard.emptyWeek,
  month: t.dashboard.emptyMonth,
};

function useTabMeetings(tab: Tab, range: DateRange | null) {
  const today = useQuery({
    queryKey: queryKeys.meetingsToday,
    queryFn: meetingsApi.today,
    enabled: tab === "today",
  });
  const ranged = useQuery({
    queryKey: queryKeys.meetingsRange(range?.from ?? "", range?.to ?? ""),
    queryFn: async (): Promise<MeetingSummary[]> =>
      (await meetingsApi.list({ from: range!.from, to: range!.to, limit: RANGE_LIMIT })).items,
    enabled: tab !== "today" && range !== null,
  });
  return tab === "today" ? today : ranged;
}

export function DashboardView() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<Tab>("today");
  const range = useMemo(
    () => (tab === "week" ? weekRange() : tab === "month" ? monthRange() : null),
    [tab],
  );

  const meetings = useTabMeetings(tab, range);
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
            {t.dashboard.greeting(user.nameBn)} · {formatDateWithWeekday(new Date())}
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
          {meetings.isPending ? (
            <LoadingBlock />
          ) : meetings.isError ? (
            <div className="p-4">
              <ErrorAlert error={meetings.error} onRetry={() => void meetings.refetch()} />
            </div>
          ) : meetings.data.length === 0 ? (
            <EmptyState
              title={emptyText[tab]}
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
