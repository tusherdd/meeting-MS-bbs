import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEETING_MINUTES,
  defaultSlot,
  durationMinutes,
  moveEndWithStart,
} from "@/lib/meeting-time";

describe("v1.18: default meeting duration 45 minutes (SPEC.md §13.6)", () => {
  it("the default is 45 minutes", () => {
    expect(DEFAULT_MEETING_MINUTES).toBe(45);
  });

  it("a new meeting slot is the next half hour in Dhaka plus 45 minutes", () => {
    // 2026-11-23 09:10 Dhaka (03:10 UTC) → 09:30–10:15.
    expect(defaultSlot(new Date("2026-11-23T03:10:00Z"))).toEqual({
      date: "2026-11-23",
      start: "09:30",
      end: "10:15",
    });
  });

  it("durationMinutes: only a positive same-day duration counts", () => {
    expect(durationMinutes("10:00", "10:45")).toBe(45);
    expect(durationMinutes("10:00", "10:00")).toBeNull();
    expect(durationMinutes("11:00", "10:00")).toBeNull();
    expect(durationMinutes("", "10:00")).toBeNull();
    expect(durationMinutes("10:00", "")).toBeNull();
  });

  it("create: setting the start time on an empty end gives start + 45 minutes", () => {
    expect(moveEndWithStart("", "10:00", "", DEFAULT_MEETING_MINUTES)).toEqual({
      endTime: "10:45",
      minutes: 45,
    });
  });

  it("a later start change keeps the current duration (default or set by the user)", () => {
    expect(moveEndWithStart("10:00", "11:00", "10:45", 45).endTime).toBe("11:45");
    // The user changed the end to 12:00 (2 h) → moving the start keeps 2 h.
    expect(moveEndWithStart("10:00", "13:30", "12:00", 45)).toEqual({
      endTime: "15:30",
      minutes: 120,
    });
  });

  it("edit: the stored duration is kept when the start moves", () => {
    // Stored meeting 14:00–15:30 (90 min).
    expect(moveEndWithStart("14:00", "09:15", "15:30", 90).endTime).toBe("10:45");
  });

  it("an invalid current duration falls back to the last known one", () => {
    // End before start (typed by the user) → the remembered duration is used.
    expect(moveEndWithStart("10:00", "10:30", "09:00", 60).endTime).toBe("11:30");
  });

  it("an incomplete start leaves the end alone but remembers the duration", () => {
    expect(moveEndWithStart("10:00", "", "11:30", 45)).toEqual({ endTime: null, minutes: 90 });
  });

  it("the end never passes 23:59 of the same day (validation still decides)", () => {
    expect(moveEndWithStart("10:00", "23:30", "10:45", 45).endTime).toBe("23:59");
  });
});
