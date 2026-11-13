"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { isPlainDate, isReportPeriod } from "@/lib/report-period";
import { dhakaToday } from "@/lib/time";
import type { ReportPeriod } from "@/lib/types";

const DEFAULT_PERIOD: ReportPeriod = "month";

/**
 * Report filters live in the address (?period=&date=&page=&wingId=&designationId=), so a reload
 * or a shared link shows the same report. Invalid values fall back to "this month".
 */
export function useReportParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawPeriod = params.get("period");
  const rawDate = params.get("date");
  const period: ReportPeriod = isReportPeriod(rawPeriod) ? rawPeriod : DEFAULT_PERIOD;
  const date = isPlainDate(rawDate) ? rawDate : dhakaToday();
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

  return { period, date, page, wingId, designationId, update };
}
