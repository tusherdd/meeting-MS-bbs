"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { formatDate, formatPlainDate } from "@/lib/format";
import { REPORT_PERIODS, containsToday, periodDays, shiftPeriod } from "@/lib/report-period";
import { dhakaToday } from "@/lib/time";
import type { PeriodDto } from "@/lib/types";
import { t } from "@/messages";

/**
 * দিন / সপ্তাহ / মাস / বছর / অর্থবছর + a date + "আগের" / "পরের". The range is shown in Bangla:
 * the backend's label when the report has loaded, else the same range computed here.
 */
export function PeriodPicker({
  idPrefix,
  period,
  date,
  loaded,
  onChange,
}: {
  idPrefix: string;
  period: PeriodDto["period"];
  date: string;
  /** The period the backend answered with (its Bangla label and exact range). */
  loaded?: PeriodDto;
  onChange: (next: { period?: PeriodDto["period"]; date?: string }) => void;
}) {
  const { first, last } = periodDays(period, date);
  const rangeText = loaded
    ? t.reports.range(
        formatDate(loaded.from),
        formatDate(new Date(new Date(loaded.to).getTime() - 1)),
      )
    : t.reports.range(formatPlainDate(first), formatPlainDate(last));

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-100">
        <Tabs
          id={`${idPrefix}-period`}
          label={t.reports.periodLabel}
          items={REPORT_PERIODS.map((p) => ({ key: p, label: t.reports.periods[p] }))}
          value={period}
          onChange={(p) => onChange({ period: p })}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-56">
          <Input
            id={`${idPrefix}-date`}
            type="date"
            label={t.reports.date}
            value={date}
            onChange={(e) => e.target.value && onChange({ date: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => onChange({ date: shiftPeriod(period, date, -1) })}
          >
            {t.reports.prev}
          </Button>
          <Button
            variant="secondary"
            disabled={containsToday(period, date)}
            onClick={() => onChange({ date: dhakaToday() })}
          >
            {t.reports.current}
          </Button>
          <Button
            variant="secondary"
            onClick={() => onChange({ date: shiftPeriod(period, date, 1) })}
          >
            {t.reports.next}
          </Button>
        </div>
      </div>
      <div aria-live="polite" className="rounded-lg bg-brand-50 px-4 py-2.5 text-brand-900">
        {loaded && <p className="font-semibold">{loaded.labelBn}</p>}
        <p className="text-sm" data-testid="report-range">
          {rangeText}
        </p>
      </div>
    </div>
  );
}
