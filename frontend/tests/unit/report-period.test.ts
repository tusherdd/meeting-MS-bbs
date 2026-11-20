import { describe, expect, it } from "vitest";
import {
  REPORT_PERIODS,
  chartBars,
  isReportPeriod,
  periodDays,
  shiftPeriod,
} from "@/lib/report-period";
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
    const { unit, bars } = chartBars(periodDays("year", "2026-11-15"), []);
    expect(unit).toBe("month");
    expect(bars.map((b) => b.key)).toHaveLength(12);
  });

  it("chart: one bar per day up to 62 days, else per month (custom ranges, v1.15)", () => {
    const short = chartBars({ first: "2026-11-01", last: "2027-01-01" }, [
      { date: "2026-11-05", meetings: 2, hours: 1.5 },
    ]);
    expect(short.unit).toBe("day");
    expect(short.bars).toHaveLength(62);
    expect(short.bars[4]).toMatchObject({ key: "2026-11-05", meetings: 2 });
    const long = chartBars({ first: "2026-11-15", last: "2027-01-16" }, [
      { date: "2026-11-20", meetings: 1, hours: 1 },
      { date: "2027-01-16", meetings: 3, hours: 2 },
    ]);
    expect(long.unit).toBe("month");
    expect(long.bars.map((b) => [b.key, b.meetings])).toEqual([
      ["2026-11", 1],
      ["2026-12", 0],
      ["2027-01", 3],
    ]);
  });
});
