"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateRange } from "@/lib/report-range";
import { useT } from "@/providers/locale-provider";

interface Props {
  idPrefix: string;
  /** The applied range (YYYY-MM-DD); the fields start from these and follow them when they change. */
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}

/**
 * v1.15: "শুরুর তারিখ" [date] – "শেষ তারিখ" [date] [দেখুন], used by "আমার রিপোর্ট" and the office
 * report. Both dates are required, the end may not be before the start and the range is at most
 * 2 years (lib/report-range.ts, checked again by the backend); while a rule is broken the message
 * is shown under the fields and "দেখুন" is disabled.
 */
export function DateRangeFilter(props: Props) {
  // A new applied range (e.g. a period button) resets the fields.
  return <RangeFields key={`${props.from}_${props.to}`} {...props} />;
}

function RangeFields({ idPrefix, from, to, onApply }: Props) {
  const t = useT();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const problem = validateRange(start, end);
  const error = problem ? t.reports.rangeErrors[problem] : undefined;

  const errorId = `${idPrefix}-range-error`;

  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) onApply(start, end);
      }}
      data-testid="date-range-filter"
    >
      <div className="flex flex-wrap items-end gap-x-2 gap-y-3">
        <div className="w-full sm:w-44">
          <Input
            id={`${idPrefix}-from`}
            type="date"
            label={t.reports.rangeStart}
            value={start}
            aria-invalid={problem === "incomplete" && !start ? true : undefined}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <span aria-hidden="true" className="hidden pb-2.5 text-slate-600 sm:block">
          –
        </span>
        <div className="w-full sm:w-44">
          <Input
            id={`${idPrefix}-to`}
            type="date"
            label={t.reports.rangeEnd}
            value={end}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!!problem}>
          {t.reports.rangeApply}
        </Button>
      </div>
      <p id={errorId} aria-live="polite" className="min-h-0 text-sm text-red-700">
        {error}
      </p>
    </form>
  );
}
