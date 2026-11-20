"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { REPORT_PERIODS } from "@/lib/report-period";
import { type ReportWhen, whenDays } from "@/lib/report-range";
import type { PeriodDto, ReportPeriod } from "@/lib/types";
import { useFormat, useT } from "@/providers/locale-provider";
import { DateRangeFilter } from "./date-range-filter";

/**
 * v1.15 report filter row: "আজ / এই সপ্তাহ / এই মাস / এই বছর", a thin divider, then the date range
 * picker; `children` adds more filters in the same row (the office report's wing and officer).
 * A period button fills both dates with that period (containing today); "দেখুন" applies a custom
 * range and no period button stays selected.
 */
export function ReportPeriodBar({
  idPrefix,
  when,
  activePeriod,
  onPeriod,
  onRange,
  children,
}: {
  idPrefix: string;
  when: ReportWhen;
  activePeriod: ReportPeriod | null;
  onPeriod: (period: ReportPeriod) => void;
  onRange: (from: string, to: string) => void;
  children?: ReactNode;
}) {
  const t = useT();
  const { first, last } = whenDays(when);

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3" data-testid="report-period-bar">
      <div role="group" aria-label={t.reports.periodLabel} className="flex flex-wrap gap-2">
        {REPORT_PERIODS.map((p) => (
          <Button
            key={p}
            type="button"
            variant={activePeriod === p ? "primary" : "secondary"}
            aria-pressed={activePeriod === p}
            onClick={() => onPeriod(p)}
          >
            {t.reports.quickPeriods[p]}
          </Button>
        ))}
      </div>
      <div aria-hidden="true" className="hidden h-16 w-px self-end bg-slate-200 sm:block" />
      <DateRangeFilter idPrefix={idPrefix} from={first} to={last} onApply={onRange} />
      {children}
    </div>
  );
}

/**
 * The shown range in the UI language: "১ নভেম্বর ২০২৬ – ৩০ নভেম্বর ২০২৬". Uses the backend's exact
 * range once the report has loaded, else the same days computed here.
 */
export function useRangeText(when: ReportWhen, loaded?: PeriodDto): string {
  const t = useT();
  const { formatDate, formatPlainDate } = useFormat();
  if (loaded) {
    return t.reports.range(
      formatDate(loaded.from),
      formatDate(new Date(new Date(loaded.to).getTime() - 1)),
    );
  }
  const { first, last } = whenDays(when);
  return t.reports.range(formatPlainDate(first), formatPlainDate(last));
}
