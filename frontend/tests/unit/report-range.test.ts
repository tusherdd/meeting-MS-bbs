import { describe, expect, it } from "vitest";
import { addYears, validateRange, whenDays, whenQuery } from "@/lib/report-range";
import { bn, en } from "@/messages";

describe("custom report range (v1.15, same rules as the backend)", () => {
  it("both dates are required", () => {
    expect(validateRange("", "2026-11-30")).toBe("incomplete");
    expect(validateRange("2026-11-01", "")).toBe("incomplete");
    expect(validateRange("2026-02-30", "2026-03-01")).toBe("incomplete");
  });

  it("the end date may not be before the start date; one day is fine", () => {
    expect(validateRange("2026-11-02", "2026-11-01")).toBe("endBeforeStart");
    expect(validateRange("2026-11-01", "2026-11-01")).toBeNull();
  });

  it("at most 2 years, both days inclusive", () => {
    expect(validateRange("2025-01-01", "2026-12-31")).toBeNull();
    expect(validateRange("2025-01-01", "2027-01-01")).toBe("tooLong");
    expect(addYears("2024-02-29", 2)).toBe("2026-02-28");
    expect(validateRange("2024-02-29", "2026-02-27")).toBeNull();
    expect(validateRange("2024-02-29", "2026-02-28")).toBe("tooLong");
  });

  it("messages in both languages", () => {
    expect(bn.reports.rangeErrors.endBeforeStart).toBe("শেষ তারিখ শুরুর তারিখের আগে হতে পারে না।");
    expect(en.reports.rangeErrors.endBeforeStart).toBe("End date cannot be before start date.");
    expect([bn.reports.rangeStart, bn.reports.rangeEnd, bn.reports.rangeApply]).toEqual([
      "শুরুর তারিখ",
      "শেষ তারিখ",
      "দেখুন",
    ]);
    expect([en.reports.rangeStart, en.reports.rangeEnd, en.reports.rangeApply]).toEqual([
      "Start date",
      "End date",
      "Apply",
    ]);
  });

  it("a range or a period becomes the right days and query", () => {
    const range = { kind: "range", from: "2026-11-01", to: "2026-12-15" } as const;
    expect(whenDays(range)).toEqual({ first: "2026-11-01", last: "2026-12-15" });
    expect(whenQuery(range)).toEqual({ from: "2026-11-01", to: "2026-12-15" });
    const month = { kind: "period", period: "month", date: "2026-11-20" } as const;
    expect(whenDays(month)).toEqual({ first: "2026-11-01", last: "2026-11-30" });
    expect(whenQuery(month)).toEqual({ period: "month", date: "2026-11-20" });
  });
});
