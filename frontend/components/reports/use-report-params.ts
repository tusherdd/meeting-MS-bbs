"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { containsToday, isPlainDate, isReportPeriod } from "@/lib/report-period";
import { type ReportWhen, validateRange } from "@/lib/report-range";
import { dhakaToday } from "@/lib/time";
import type { ReportPeriod } from "@/lib/types";

const DEFAULT_PERIOD: ReportPeriod = "month";

/**
 * Report filters live in the address (?period=&date= or, v1.15, ?from=&to=, plus page, wingId,
 * …), so a reload or a shared link shows the same report. A valid from/to wins over the period;
 * invalid values fall back to "this month".
 *
 * `activePeriod`: the period button shown as selected — only when the address holds a period that
 * contains today ("এই মাস" …); a custom range or an older period selects none.
 */
export function useReportParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawPeriod = params.get("period");
  const rawDate = params.get("date");
  const rawFrom = params.get("from") ?? "";
  const rawTo = params.get("to") ?? "";
  const period: ReportPeriod = isReportPeriod(rawPeriod) ? rawPeriod : DEFAULT_PERIOD;
  const date = isPlainDate(rawDate) ? rawDate : dhakaToday();
  const when: ReportWhen =
    validateRange(rawFrom, rawTo) === null
      ? { kind: "range", from: rawFrom, to: rawTo }
      : { kind: "period", period, date };
  const activePeriod: ReportPeriod | null =
    when.kind === "period" && containsToday(when.period, when.date) ? when.period : null;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const wingId = params.get("wingId") ?? "";
  const designationId = params.get("designationId") ?? "";

  const update = useCallback(
    (changes: Record<string, string | number | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      // A new filter starts on page 1 unless the page itself changes.
      if (!("page" in changes)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  /** A period button: this period (containing today); clears a custom range. */
  const choosePeriod = useCallback(
    (p: ReportPeriod) => update({ period: p, date: undefined, from: undefined, to: undefined }),
    [update],
  );
  /** "দেখুন": a custom range; de-selects every period button. */
  const chooseRange = useCallback(
    (from: string, to: string) => update({ from, to, period: undefined, date: undefined }),
    [update],
  );

  return {
    period,
    date,
    when,
    activePeriod,
    page,
    wingId,
    designationId,
    update,
    choosePeriod,
    chooseRange,
  };
}
