import { describe, expect, it } from "vitest";
import { isOrganizerOrChair, rowActions } from "@/lib/row-actions";

const now = new Date("2026-11-17T06:00:00Z");
const future = { status: "SCHEDULED" as const, endAt: "2026-11-20T06:00:00Z" };

describe("row menu items (v1.10)", () => {
  it("organizer or chair of a scheduled future meeting: all four items", () => {
    expect(rowActions(future, true, now)).toEqual({
      view: true,
      exportPdf: true,
      edit: true,
      cancel: true,
    });
  });

  it("a plain member (or an admin who is neither): only View and Export", () => {
    expect(rowActions(future, false, now)).toEqual({
      view: true,
      exportPdf: true,
      edit: false,
      cancel: false,
    });
  });

  it("cancelled: no Export PDF, no Edit, no Cancel", () => {
    expect(rowActions({ ...future, status: "CANCELLED" }, true, now)).toEqual({
      view: true,
      exportPdf: false,
      edit: false,
      cancel: false,
    });
  });

  it("completed: Export only", () => {
    const r = rowActions({ ...future, status: "COMPLETED" }, true, now);
    expect([r.exportPdf, r.edit, r.cancel]).toEqual([true, false, false]);
  });

  it("scheduled but already ended: Cancel, no Edit", () => {
    const r = rowActions({ status: "SCHEDULED", endAt: "2026-11-16T06:00:00Z" }, true, now);
    expect([r.edit, r.cancel]).toEqual([false, true]);
  });

  it("organizer or internal chair by role", () => {
    expect(isOrganizerOrChair("ORGANIZER")).toBe(true);
    expect(isOrganizerOrChair("CHAIR")).toBe(true);
    expect(isOrganizerOrChair("MEMBER")).toBe(false);
    expect(isOrganizerOrChair(null)).toBe(false);
  });
});
