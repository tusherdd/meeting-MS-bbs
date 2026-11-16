import { describe, expect, it } from "vitest";
import { createFormatter, toBanglaDigits } from "@/lib/format";

// 2026-11-09 04:30 UTC = Monday 10:30 in Dhaka (UTC+6); 18:05 UTC = Tuesday 00:05 in Dhaka.
const MORNING = "2026-11-09T04:30:00Z";
const AFTER_MIDNIGHT = "2026-11-09T18:05:00Z";

describe("format.ts — English", () => {
  const f = createFormatter("en");
  it("uses Latin digits and English names on the Dhaka clock", () => {
    expect(f.formatDate(MORNING)).toBe("9 November 2026");
    expect(f.formatDateWithWeekday(MORNING)).toBe("Monday, 9 November 2026");
    expect(f.formatTime(MORNING)).toBe("10:30 AM");
    expect(f.formatTime("2026-11-09T08:00:00Z")).toBe("2:00 PM");
    expect(f.formatTime("2026-11-09T06:00:00Z")).toBe("12:00 PM");
    expect(f.formatDateTime(AFTER_MIDNIGHT)).toBe("10 November 2026, 12:05 AM");
    expect(f.formatTimeRange(MORNING, "2026-11-09T05:30:00Z")).toBe("10:30 AM – 11:30 AM");
    expect(f.formatMonthYear(MORNING)).toBe("November 2026");
    expect(f.formatDayMonth(MORNING)).toBe("9 November");
  });
  it("numbers, hours and plain dates", () => {
    expect(f.formatNumber(1234.56)).toBe("1,234.6");
    expect(f.formatHours(2.5)).toBe("2.5 ");
    expect(f.digits(404)).toBe("404");
    expect(f.formatPlainDate("2026-12-01")).toBe("1 December 2026");
    expect(f.formatPlainDayMonth("2026-12-01")).toBe("1 December");
    expect(f.formatPlainMonthYear("2026-12")).toBe("December 2026");
    expect(f.formatPlainMonth("2026-12")).toBe("December");
    expect(f.formatPlainDay("2026-12-01")).toBe("1");
  });
});

describe("format.ts — Bangla", () => {
  const f = createFormatter("bn");
  it("uses Bangla digits and Bangla names on the Dhaka clock", () => {
    expect(f.formatDate(MORNING)).toBe("৯ নভেম্বর ২০২৬");
    expect(f.formatDateWithWeekday(MORNING)).toBe("সোমবার, ৯ নভেম্বর ২০২৬");
    expect(f.formatTime(MORNING)).toMatch(/^১০:৩০ /);
    expect(f.formatDate(AFTER_MIDNIGHT)).toBe("১০ নভেম্বর ২০২৬");
    expect(f.formatMonthYear(MORNING)).toBe("নভেম্বর ২০২৬");
  });
  it("numbers, hours and plain dates", () => {
    expect(f.formatNumber(1234.56)).toBe("১,২৩৪.৬");
    expect(f.formatHours(2.5)).toBe("২.৫ ");
    expect(f.digits(404)).toBe("৪০৪");
    expect(f.formatPlainDate("2026-12-01")).toBe("১ ডিসেম্বর ২০২৬");
    expect(toBanglaDigits("2026-11-09 10:30")).toBe("২০২৬-১১-০৯ ১০:৩০");
  });
});
