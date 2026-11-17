"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { decisionsApi, queryKeys } from "@/lib/endpoints";
import { useFormat, useT } from "@/providers/locale-provider";

/**
 * Dashboard card "সভা সিদ্ধান্ত" (v1.11): Pending and Complete counts of the meetings I organize
 * or chair, linking to /decisions. Only for users who organize or chair at least one meeting.
 */
export function DecisionCard() {
  const t = useT();
  const { formatNumber } = useFormat();
  const summary = useQuery({ queryKey: queryKeys.decisionSummary, queryFn: decisionsApi.summary });
  if (!summary.data?.leads) return null;
  const items = [
    { label: t.decisions.cardPending, value: summary.data.pending, testId: "decision-card-pending" },
    { label: t.decisions.cardComplete, value: summary.data.complete, testId: "decision-card-complete" },
  ];
  return (
    <section
      aria-labelledby="decision-card-title"
      className="rounded-lg border border-slate-200 bg-white px-4 py-3 sm:px-5"
      data-testid="decision-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="decision-card-title" className="text-lg font-semibold text-slate-900">
          {t.decisions.title}
        </h2>
        <Link href="/decisions" className="text-sm font-medium text-brand-800 hover:underline">
          {t.decisions.cardLink}
        </Link>
      </div>
      <dl className="mt-2 flex flex-wrap gap-6">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-slate-600">{item.label}</dt>
            <dd
              className={`text-xl font-semibold ${item.label === t.decisions.cardPending && item.value > 0 ? "text-amber-900" : "text-slate-900"}`}
              data-testid={item.testId}
            >
              {formatNumber(item.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
