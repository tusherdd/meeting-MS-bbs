"use client";

import { useQuery } from "@tanstack/react-query";
import { ErrorAlert } from "@/components/ui/alert";
import { formatHours, formatNumber } from "@/lib/format";
import { queryKeys, reportsApi } from "@/lib/endpoints";
import { dhakaToday } from "@/lib/time";
import { t } from "@/messages";

/** Small numbers for today, from GET /reports/me?period=day. */
export function SummaryRow() {
  const date = dhakaToday();
  const report = useQuery({
    queryKey: queryKeys.myReport("day", date),
    queryFn: () => reportsApi.me("day", date),
  });

  if (report.isError)
    return <ErrorAlert error={report.error} onRetry={() => void report.refetch()} />;

  const s = report.data?.summary;
  const items = [
    { label: t.dashboard.summary.total, value: s && formatNumber(s.totalMeetings) },
    { label: t.dashboard.summary.organized, value: s && formatNumber(s.organized) },
    { label: t.dashboard.summary.attended, value: s && formatNumber(s.attended) },
    { label: t.dashboard.summary.hours, value: s && formatHours(s.totalHours) },
    {
      label: t.dashboard.summary.conflicts,
      value: s && formatNumber(s.conflictsRaisedAgainstMyMeetings),
      warn: !!s && s.conflictsRaisedAgainstMyMeetings > 0,
    },
  ];

  return (
    <section aria-label={t.dashboard.summaryTitle}>
      <h2 className="sr-only">{t.dashboard.summaryTitle}</h2>
      <dl
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        aria-busy={report.isPending}
      >
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <dt className="text-xs text-slate-500">{item.label}</dt>
            <dd
              className={`mt-1 text-xl font-semibold ${item.warn ? "text-red-700" : "text-slate-900"}`}
            >
              {item.value ?? (
                <span className="inline-block h-6 w-10 animate-pulse rounded bg-slate-100" />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
