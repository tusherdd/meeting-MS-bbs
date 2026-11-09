"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { LoadingBlock } from "@/components/ui/spinner";
import { Tabs } from "@/components/ui/tabs";
import { meetingsApi, queryKeys } from "@/lib/endpoints";
import type { ConflictListItem, ConflictStatus } from "@/lib/types";
import { t } from "@/messages";
import { useAuth } from "@/providers/auth-provider";
import { ConflictCard } from "./conflict-card";

type Tab = "PENDING" | "RESOLVED" | "ALL";

function ConflictItems({ items, empty }: { items: ConflictListItem[]; empty: string }) {
  if (items.length === 0) return <EmptyState title={empty} />;
  return (
    <ul className="space-y-3 p-4 sm:p-5">
      {items.map((c) => (
        <ConflictCard key={c.id} conflict={c} />
      ))}
    </ul>
  );
}

function MyConflicts({ status }: { status: ConflictStatus }) {
  const list = useQuery({
    queryKey: queryKeys.myConflictsByStatus(status),
    queryFn: () => meetingsApi.myConflicts(status),
  });
  if (list.isPending) return <LoadingBlock />;
  if (list.isError) {
    return (
      <div className="p-4">
        <ErrorAlert error={list.error} onRetry={() => void list.refetch()} />
      </div>
    );
  }
  return (
    <>
      <ConflictItems
        items={list.data}
        empty={status === "PENDING" ? t.conflictsPage.emptyPending : t.conflictsPage.emptyResolved}
      />
      {status === "RESOLVED" && list.data.length >= 100 && (
        <p className="px-5 pb-4 text-xs text-slate-500">{t.conflictsPage.resolvedHistoryNote}</p>
      )}
    </>
  );
}

function AllConflicts() {
  const [status, setStatus] = useState<ConflictStatus | "">("PENDING");
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: queryKeys.allConflicts(status || undefined, page),
    queryFn: () => meetingsApi.allConflicts(status || undefined, page),
    placeholderData: keepPreviousData,
  });
  return (
    <div>
      <div className="max-w-xs px-4 pt-4 sm:px-5">
        <Select
          id="all-conflicts-status"
          label={t.meetingsList.status}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ConflictStatus | "");
            setPage(1);
          }}
          placeholder={t.conflictsPage.all}
          options={[
            { value: "PENDING", label: t.conflictsPage.allPending },
            { value: "RESOLVED", label: t.conflictsPage.allResolved },
          ]}
        />
      </div>
      {list.isPending ? (
        <LoadingBlock />
      ) : list.isError ? (
        <div className="p-4">
          <ErrorAlert error={list.error} onRetry={() => void list.refetch()} />
        </div>
      ) : (
        <div aria-busy={list.isFetching}>
          <ConflictItems items={list.data.items} empty={t.conflictsPage.emptyResolved} />
          <Pagination page={page} totalPages={list.data.totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

export function ConflictsView() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("PENDING");
  const items: { key: Tab; label: string }[] = [
    { key: "PENDING", label: t.conflictsPage.pending },
    { key: "RESOLVED", label: t.conflictsPage.resolved },
    ...(isAdmin ? [{ key: "ALL" as const, label: t.conflictsPage.all }] : []),
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t.conflictsPage.title}</h1>
      <Card>
        <div className="border-b border-slate-100 px-4 pt-3 sm:px-5">
          <Tabs
            id="conflicts"
            label={t.conflictsPage.title}
            items={items}
            value={tab}
            onChange={setTab}
          />
        </div>
        <div id="conflicts-panel" role="tabpanel" aria-labelledby={`conflicts-tab-${tab}`}>
          {tab === "ALL" ? <AllConflicts /> : <MyConflicts status={tab} />}
        </div>
      </Card>
    </div>
  );
}
