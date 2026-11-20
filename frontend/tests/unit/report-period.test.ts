import { describe, expect, it } from "vitest";
import { REPORT_PERIODS, chartBars, isReportPeriod, periodDays, shiftPeriod } from "@/lib/report-period";
import { bn, en } from "@/messages";

describe("report periods (v1.15: fiscal year removed)", () => {
  it("offers day, week, month and year only", () => {
    expect(REPORT_PERIODS).toEqual(["day", "week", "month", "year"]);
    expect(isReportPeriod("fiscal-year")).toBe(false);
    expect(Object.keys(bn.reports.periods)).toEqual([...REPORT_PERIODS]);
    expect(Object.keys(en.reports.periods)).toEqual([...REPORT_PERIODS]);
  });

  it("year = January to December; one bar per month", () => {
    expect(periodDays("year", "2026-11-15")).toEqual({ first: "2026-01-01", last: "2026-12-31" });
    expect(shiftPeriod("year", "2026-11-15", -1)).toBe("2025-01-01");
    const { unit, bars } = chartBars("year", "2026-11-15", []);
    expect(unit).toBe("month");
    expect(bars.map((b) => b.key)).toHaveLength(12);
  });
});
