"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MeetingList } from "@/components/dashboard/meeting-list";
import { ErrorAlert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { LoadingBlock } from "@/components/ui/spinner";
import { formatNumber } from "@/lib/format";
import { meetingsApi, queryKeys, type MeetingListQuery } from "@/lib/endpoints";
import { addDays, dateRangeToIso, dhakaToday, monthBounds, sundayOf } from "@/lib/time";
import type { MeetingStatus } from "@/lib/types";
import { t } from "@/messages";
import { useAuth } from "@/providers/auth-provider";

const PAGE_SIZE = 20;

type Quick = "today" | "week" | "month";

function quickRange(kind: Quick): { from: string; to: string } {
  const today = dhakaToday();
  if (kind === "today") return { from: today, to: today };
  if (kind === "week") {
    const sunday = sundayOf(today);
    return { from: sunday, to: addDays(sunday, 6) };
  }
  const { first, next } = monthBounds(today);
  return { from: first, to: addDays(next, -1) };
}

export function MeetingsListView() {
  const { isAdmin } = useAuth();
  const [range, setRange] = useState(() => quickRange("month"));
  const [status, setStatus] = useState<MeetingStatus | "">("");
  const [role, setRole] = useState<"organizer" | "participant" | "">("");
  const [allMeetings, setAllMeetings] = useState(false);
  const [page, setPage] = useState(1);

  const query = useMemo<MeetingListQuery>(() => {
    const valid = range.from && range.to && range.from <= range.to;
    const iso = valid ? dateRangeToIso(range.from, range.to) : null;
    return {
      from: iso?.from,
      to: iso?.to,
      status: status || undefined,
      role: !allMeetings && role ? role : undefined,
      scope: isAdmin && allMeetings ? "all" : undefined,
      page,
      limit: PAGE_SIZE,
    };
  }, [range, status, role, allMeetings, isAdmin, page]);

  const meetings = useQuery({
    queryKey: queryKeys.meetingsList(query),
    queryFn: () => meetingsApi.list(query),
    placeholderData: keepPreviousData,
  });
  const conflicts = useQuery({
    queryKey: queryKeys.myConflicts,
    queryFn: () => meetingsApi.myConflicts(),
  });
  const conflictIds = useMemo(
    () => new Set((conflicts.data ?? []).flatMap((c) => [c.lowerMeeting.id, c.higherMeeting.id])),
    [conflicts.data],
  );

  function update<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }
  const setQuick = (kind: Quick) => update(setRange)(quickRange(kind));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">{t.meetingsList.title}</h1>
        <LinkButton href="/meetings/new">{t.dashboard.newMeeting}</LinkButton>
      </div>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setQuick("today")}>
            {t.dashboard.tabs.today}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setQuick("week")}>
            {t.dashboard.tabs.week}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setQuick("month")}>
            {t.dashboard.tabs.month}
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            id="filter-from"
            type="date"
            label={t.meetingsList.from}
            value={range.from}
            onChange={(e) => update(setRange)({ ...range, from: e.target.value })}
          />
          <Input
            id="filter-to"
            type="date"
            label={t.meetingsList.to}
            value={range.to}
            onChange={(e) => update(setRange)({ ...range, to: e.target.value })}
          />
          <Select
            id="filter-status"
            label={t.meetingsList.status}
            value={status}
            onChange={(e) => update(setStatus)(e.target.value as MeetingStatus | "")}
            placeholder={t.meetingsList.allStatuses}
            options={(["SCHEDULED", "COMPLETED", "CANCELLED"] as const).map((s) => ({
              value: s,
              label: t.meeting.status[s],
            }))}
          />
          <Select
            id="filter-role"
            label={t.meetingsList.role}
            value={role}
            disabled={allMeetings}
            onChange={(e) => update(setRole)(e.target.value as "organizer" | "participant" | "")}
            placeholder={t.meetingsList.allRoles}
            options={[
              { value: "organizer", label: t.meetingsList.roleOrganizer },
              { value: "participant", label: t.meetingsList.roleParticipant },
            ]}
          />
        </div>
        {isAdmin && (
          <label className="flex w-fit items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              className="size-4 accent-brand-700"
              checked={allMeetings}
              onChange={(e) => update(setAllMeetings)(e.target.checked)}
            />
            {t.meetingsList.allMeetings}
          </label>
        )}
      </Card>

      <Card>
        {meetings.isPending ? (
          <LoadingBlock />
        ) : meetings.isError ? (
          <div className="p-4">
            <ErrorAlert error={meetings.error} onRetry={() => void meetings.refetch()} />
          </div>
        ) : meetings.data.items.length === 0 ? (
          <EmptyState title={t.meetingsList.empty} />
        ) : (
          <div aria-busy={meetings.isFetching}>
            <p className="px-4 pt-3 text-sm text-slate-500 sm:px-5">
              {t.meetingsList.total(formatNumber(meetings.data.total))}
            </p>
            <MeetingList meetings={meetings.data.items} conflictIds={conflictIds} showDate />
            <Pagination page={page} totalPages={meetings.data.totalPages} onChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
