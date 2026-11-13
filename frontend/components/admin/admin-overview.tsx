"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import Link from "next/link";
import { ErrorAlert } from "@/components/ui/alert";
import { LoadingBlock } from "@/components/ui/spinner";
import { adminApi, queryKeys } from "@/lib/endpoints";
import { formatDateTime, formatNumber } from "@/lib/format";
import { t } from "@/messages";

interface StatCard {
  label: string;
  value: number;
  href?: string;
  /** Red when > 0 (needs an admin's attention). */
  alert?: boolean;
}

/** /admin: counters from GET /admin/stats; the ones that need action link to their page. */
export function AdminOverview() {
  const stats = useQuery({
    queryKey: queryKeys.adminStats,
    queryFn: adminApi.stats,
    refetchInterval: 60_000,
  });

  if (stats.isPending) return <LoadingBlock />;
  if (stats.isError) return <ErrorAlert error={stats.error} onRetry={() => void stats.refetch()} />;
  const s = stats.data;

  const attention: StatCard[] = [
    {
      label: t.admin.stats.pendingChangeRequests,
      value: s.pendingChangeRequests,
      href: "/admin/change-requests",
      alert: true,
    },
    {
      label: t.admin.stats.pendingConflicts,
      value: s.pendingConflicts,
      href: "/admin/conflicts",
      alert: true,
    },
    {
      label: t.admin.stats.failedMails,
      value: s.failedMails,
      href: "/admin/email-outbox?status=FAILED",
      alert: true,
    },
  ];
  const info: StatCard[] = [
    { label: t.admin.stats.usersTotal, value: s.users.total, href: "/admin/users" },
    { label: t.admin.stats.usersActive, value: s.users.active, href: "/admin/users?isActive=true" },
    {
      label: t.admin.stats.usersInactive,
      value: s.users.inactive,
      href: "/admin/users?isActive=false",
    },
    { label: t.admin.stats.admins, value: s.users.admins, href: "/admin/users?role=ADMIN" },
    { label: t.admin.stats.meetingsToday, value: s.meetings.today, href: "/admin/meetings" },
    { label: t.admin.stats.meetingsWeek, value: s.meetings.thisWeek, href: "/admin/meetings" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">{t.admin.overviewTitle}</h1>
        <p className="text-xs text-slate-600">
          {t.admin.stats.generatedAt(formatDateTime(s.generatedAt))}
        </p>
      </div>
      <StatGrid items={attention} testId="admin-attention" />
      <StatGrid items={info} testId="admin-info" />
    </div>
  );
}

function StatGrid({ items, testId }: { items: StatCard[]; testId: string }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid={testId}>
      {items.map((item) => {
        const warn = item.alert && item.value > 0;
        const body = (
          <>
            <span className="block text-sm text-slate-600">{item.label}</span>
            <span
              className={clsx(
                "mt-1 block text-2xl font-semibold",
                warn ? "text-red-700" : "text-slate-900",
              )}
            >
              {formatNumber(item.value)}
            </span>
            {item.href && (
              <span className="mt-1 block text-sm font-medium text-brand-700">
                {t.admin.stats.open}
              </span>
            )}
          </>
        );
        const box = clsx(
          "block rounded-xl border bg-white px-4 py-3 shadow-sm",
          warn ? "border-red-300" : "border-slate-200",
        );
        return (
          <li key={item.label}>
            {item.href ? (
              <Link
                href={item.href}
                className={clsx(box, "hover:border-brand-400 hover:bg-brand-50/40")}
              >
                {body}
              </Link>
            ) : (
              <div className={box}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
