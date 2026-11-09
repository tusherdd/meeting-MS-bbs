"use client";

import clsx from "clsx";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { LoadingBlock } from "@/components/ui/spinner";
import { Tabs } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/format";
import { notificationsApi, queryKeys } from "@/lib/endpoints";
import type { AppNotification } from "@/lib/types";
import { t } from "@/messages";

type Filter = "all" | "unread";

/** In-app links only ("/meetings/…"), never an external address. */
export function isInternalLink(link: string | null): link is string {
  return !!link && link.startsWith("/") && !link.startsWith("//");
}

export function NotificationsView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const router = useRouter();
  const queryClient = useQueryClient();
  const unread = filter === "unread";

  const list = useQuery({
    queryKey: queryKeys.notificationsList(unread, page),
    queryFn: () => notificationsApi.list(unread, page),
    placeholderData: keepPreviousData,
  });
  const unreadCount = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: notificationsApi.unreadCount,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: refresh });
  const markOne = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: refresh });

  async function open(n: AppNotification) {
    if (!n.readAt) await markOne.mutateAsync(n.id).catch(() => undefined);
    if (isInternalLink(n.link)) router.push(n.link);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">{t.notificationsPage.title}</h1>
        <Button
          variant="secondary"
          onClick={() => markAll.mutate()}
          loading={markAll.isPending}
          disabled={(unreadCount.data?.count ?? 0) === 0}
        >
          {t.header.markAllRead}
        </Button>
      </div>
      {markAll.isError && <ErrorAlert error={markAll.error} />}

      <Card>
        <div className="border-b border-slate-100 px-4 pt-3 sm:px-5">
          <Tabs
            id="notifications"
            label={t.notificationsPage.title}
            items={[
              { key: "all", label: t.notificationsPage.all },
              { key: "unread", label: t.notificationsPage.unread },
            ]}
            value={filter}
            onChange={(f) => {
              setFilter(f);
              setPage(1);
            }}
          />
        </div>
        <div
          id="notifications-panel"
          role="tabpanel"
          aria-labelledby={`notifications-tab-${filter}`}
        >
          {list.isPending ? (
            <LoadingBlock />
          ) : list.isError ? (
            <div className="p-4">
              <ErrorAlert error={list.error} onRetry={() => void list.refetch()} />
            </div>
          ) : list.data.items.length === 0 ? (
            <EmptyState
              title={unread ? t.notificationsPage.emptyUnread : t.notificationsPage.empty}
            />
          ) : (
            <div aria-busy={list.isFetching}>
              <ul className="divide-y divide-slate-100" data-testid="notification-list">
                {list.data.items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => void open(n)}
                      className={clsx(
                        "flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 sm:px-5",
                        !n.readAt && "bg-brand-50/50",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-slate-900">
                          {!n.readAt && (
                            <span className="mr-1.5 rounded bg-brand-700 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                              {t.header.unreadBadge}
                            </span>
                          )}
                          {n.title}
                        </span>
                        <span className="mt-0.5 block text-sm whitespace-pre-line text-slate-700">
                          {n.body}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {formatDateTime(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <Pagination page={page} totalPages={list.data.totalPages} onChange={setPage} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
