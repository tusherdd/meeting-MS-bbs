"use client";

import clsx from "clsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime, formatNumber } from "@/lib/format";
import { notificationsApi, queryKeys } from "@/lib/endpoints";
import type { AppNotification } from "@/lib/types";
import { t } from "@/messages";
import { useDismiss } from "./use-dismiss";

const UNREAD_POLL_MS = 60_000;

/**
 * Bell with the unread count (GET /notifications/unread-count every 60 s and when the window
 * gets focus). The dropdown loads the latest 10 only when it is opened.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(boxRef, open, close, buttonRef);

  const unread = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: notificationsApi.unreadCount,
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const latest = useQuery({
    queryKey: queryKeys.latestNotifications,
    queryFn: () => notificationsApi.latest(10),
    enabled: open,
    staleTime: 0,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: refresh });
  const markOne = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: refresh });

  const count = unread.data?.count ?? 0;

  function openNotification(n: AppNotification) {
    if (!n.readAt) markOne.mutate(n.id);
    // Only in-app links ("/meetings/…"); never an external address.
    if (n.link && n.link.startsWith("/") && !n.link.startsWith("//")) {
      setOpen(false);
      router.push(n.link);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={
          count > 0
            ? `${t.header.notifications}: ${t.header.unread(formatNumber(count))}`
            : t.header.notifications
        }
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none">
          <path
            d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {count > 0 && (
          <span
            data-testid="unread-count"
            className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] leading-5 font-semibold text-white"
          >
            {count > 99 ? "৯৯+" : formatNumber(count)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="font-semibold text-slate-900">{t.header.notifications}</p>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={count === 0 || markAll.isPending}
              className="rounded px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              {markAll.isPending ? <Spinner /> : t.header.markAllRead}
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {latest.isPending ? (
              <div className="flex justify-center py-6 text-brand-700">
                <Spinner />
              </div>
            ) : latest.isError ? (
              <div className="p-3">
                <ErrorAlert error={latest.error} onRetry={() => void latest.refetch()} />
              </div>
            ) : latest.data.items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                {t.header.noNotifications}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {latest.data.items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className={clsx(
                        "flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50",
                        !n.readAt && "bg-brand-50/50",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={clsx(
                          "mt-2 size-2 shrink-0 rounded-full",
                          n.readAt ? "bg-transparent" : "bg-brand-600",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900">{n.title}</span>
                        <span className="mt-0.5 line-clamp-2 block text-sm text-slate-600">
                          {n.body}
                        </span>
                        <span className="mt-1 block text-xs text-slate-400">
                          {formatDateTime(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {t.notificationsPage.seeAll}
          </Link>
        </div>
      )}
    </div>
  );
}
