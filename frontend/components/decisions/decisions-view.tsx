"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MeetingList } from "@/components/dashboard/meeting-list";
import { ErrorAlert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { Tabs, tabPanelProps } from "@/components/ui/tabs";
import { decisionsApi, queryKeys } from "@/lib/endpoints";
import type { DecisionStatus } from "@/lib/types";
import { useFormat, useT } from "@/providers/locale-provider";

const NO_CONFLICTS: ReadonlySet<string> = new Set();
const TABS_ID = "decision-tabs";

/** One paginated list of meetings from GET /decisions. */
function DecisionMeetings({
  as,
  status,
  empty,
}: {
  as: "lead" | "member";
  status: DecisionStatus;
  empty: string;
}) {
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: queryKeys.decisionList(as, status, page),
    queryFn: () => decisionsApi.list(as, status, page),
    placeholderData: keepPreviousData,
  });
  if (list.isPending) return <LoadingBlock />;
  if (list.isError)
    return (
      <div className="p-4">
        <ErrorAlert error={list.error} onRetry={() => void list.refetch()} />
      </div>
    );
  if (list.data.items.length === 0) return <EmptyState title={empty} />;
  return (
    <>
      <MeetingList meetings={list.data.items} conflictIds={NO_CONFLICTS} showDate />
      <Pagination page={list.data.page} totalPages={list.data.totalPages} onChange={setPage} />
    </>
  );
}

/**
 * /decisions (v1.11, SPEC.md §13.19): Pending / Complete tabs (with counts) for the meetings I
 * organize or chair, and below them "আমি সদস্য": meetings where I am only a member and the
 * decision is Pending (no counts for members).
 */
export function DecisionsView() {
  const t = useT();
  const { formatNumber } = useFormat();
  const [tab, setTab] = useState<DecisionStatus>("PENDING");
  const summary = useQuery({ queryKey: queryKeys.decisionSummary, queryFn: decisionsApi.summary });
  const count = (n: number | undefined) => (n === undefined ? "…" : formatNumber(n));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t.decisions.title}</h1>
      {summary.isError && (
        <ErrorAlert error={summary.error} onRetry={() => void summary.refetch()} />
      )}

      <Card>
        <div className="border-b border-slate-100 px-4 pt-3 sm:px-5">
          <p className="pb-2 text-sm text-slate-600">{t.decisions.leadHint}</p>
          <Tabs
            id={TABS_ID}
            label={t.decisions.tabsLabel}
            value={tab}
            onChange={setTab}
            items={[
              {
                key: "PENDING",
                label: t.decisions.tabs(t.decisions.status.PENDING, count(summary.data?.pending)),
              },
              {
                key: "COMPLETE",
                label: t.decisions.tabs(t.decisions.status.COMPLETE, count(summary.data?.complete)),
              },
            ]}
          />
        </div>
        <div {...tabPanelProps(TABS_ID, tab)}>
          <DecisionMeetings
            key={tab}
            as="lead"
            status={tab}
            empty={tab === "PENDING" ? t.decisions.emptyPending : t.decisions.emptyComplete}
          />
        </div>
      </Card>

      <Card aria-labelledby="decisions-member">
        <CardHeader title={<span id="decisions-member">{t.decisions.asMember}</span>} />
        <p className="px-4 pt-3 text-sm text-slate-600 sm:px-5">{t.decisions.asMemberHint}</p>
        <DecisionMeetings as="member" status="PENDING" empty={t.decisions.emptyMember} />
      </Card>
    </div>
  );
}
