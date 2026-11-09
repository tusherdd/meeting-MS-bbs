"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/spinner";
import { Tabs } from "@/components/ui/tabs";
import { formatMonthYear, formatPlainDate } from "@/lib/format";
import { meetingsApi, queryKeys } from "@/lib/endpoints";
import { addDays, dhakaMidnight, dhakaToday, monthBounds, sundayOf } from "@/lib/time";
import { t } from "@/messages";
import { DayList } from "./day-list";
import { MonthGrid } from "./month-grid";
import { WeekGrid } from "./week-grid";

type View = "week" | "month";

/** Visible dates for a view: the week (Sun–Sat) or the whole weeks that cover the month. */
function visibleRange(view: View, anchor: string) {
  if (view === "week") {
    const sunday = sundayOf(anchor);
    return { start: sunday, endExclusive: addDays(sunday, 7), weeks: 1 };
  }
  const { first, next } = monthBounds(anchor);
  const start = sundayOf(first);
  const lastSunday = sundayOf(addDays(next, -1));
  const endExclusive = addDays(lastSunday, 7);
  const weeks = Math.round(
    (Date.parse(`${endExclusive}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / (7 * 86_400_000),
  );
  return { start, endExclusive, weeks };
}

export function CalendarView() {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => dhakaToday());
  const range = visibleRange(view, anchor);
  const from = dhakaMidnight(range.start);
  const to = dhakaMidnight(range.endExclusive);

  const meetings = useQuery({
    queryKey: queryKeys.meetingsCalendar(from, to),
    queryFn: () => meetingsApi.listAll(from, to),
  });
  const conflicts = useQuery({
    queryKey: queryKeys.myConflicts,
    queryFn: () => meetingsApi.myConflicts(),
  });
  const conflictIds = useMemo(
    () => new Set((conflicts.data ?? []).flatMap((c) => [c.lowerMeeting.id, c.higherMeeting.id])),
    [conflicts.data],
  );

  function move(step: number) {
    if (view === "week") setAnchor(addDays(sundayOf(anchor), step * 7));
    else {
      const { first, next } = monthBounds(anchor);
      setAnchor(step > 0 ? next : monthBounds(addDays(first, -1)).first);
    }
  }

  const title =
    view === "week"
      ? `${formatPlainDate(range.start)} – ${formatPlainDate(addDays(range.start, 6))}`
      : formatMonthYear(`${monthBounds(anchor).first}T12:00:00+06:00`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">{t.calendar.title}</h1>
        <LinkButton href="/meetings/new">{t.dashboard.newMeeting}</LinkButton>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 pt-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => move(-1)}
              aria-label={t.calendar.prev}
            >
              ‹ {t.calendar.prev}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAnchor(dhakaToday())}>
              {t.calendar.today}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => move(1)}
              aria-label={t.calendar.next}
            >
              {t.calendar.next} ›
            </Button>
            <h2 className="ml-1 text-base font-semibold text-slate-900" aria-live="polite">
              {title}
            </h2>
          </div>
          <Tabs
            id="calendar-view"
            label={t.calendar.title}
            items={[
              { key: "week", label: t.calendar.week },
              { key: "month", label: t.calendar.month },
            ]}
            value={view}
            onChange={setView}
          />
        </div>

        <div
          id="calendar-view-panel"
          role="tabpanel"
          aria-labelledby={`calendar-view-tab-${view}`}
          aria-busy={meetings.isFetching}
        >
          {meetings.isPending ? (
            <LoadingBlock />
          ) : meetings.isError ? (
            <div className="p-4">
              <ErrorAlert error={meetings.error} onRetry={() => void meetings.refetch()} />
            </div>
          ) : view === "week" ? (
            <>
              <div className="hidden md:block">
                <WeekGrid sunday={range.start} meetings={meetings.data} conflictIds={conflictIds} />
              </div>
              <div className="md:hidden">
                <DayList sunday={range.start} meetings={meetings.data} conflictIds={conflictIds} />
              </div>
            </>
          ) : (
            <MonthGrid
              gridStart={range.start}
              month={monthBounds(anchor).first.slice(0, 7)}
              weeks={range.weeks}
              meetings={meetings.data}
              conflictIds={conflictIds}
              onOpenDay={(d) => {
                setAnchor(d);
                setView("week");
              }}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
