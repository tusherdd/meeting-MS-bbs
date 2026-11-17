import { describe, expect, it } from "vitest";
import { isOrganizerOrChair, isParticipant, rowActions } from "@/lib/row-actions";

const now = new Date("2026-11-17T06:00:00Z");
const future = {
  status: "SCHEDULED" as const,
  startAt: "2026-11-20T05:00:00Z",
  endAt: "2026-11-20T06:00:00Z",
};
const started = {
  status: "SCHEDULED" as const,
  startAt: "2026-11-17T05:00:00Z",
  endAt: "2026-11-17T07:00:00Z",
};

describe("row menu items (v1.10)", () => {
  it("organizer or chair of a scheduled future meeting: View, Export, Edit, Cancel", () => {
    expect(rowActions(future, true, now)).toEqual({
      view: true,
      exportPdf: true,
      edit: true,
      cancel: true,
      uploadDecision: false,
    });
  });

  it("a plain member (or an admin who is neither): only View and Export", () => {
    expect(rowActions(future, false, now)).toEqual({
      view: true,
      exportPdf: true,
      edit: false,
      cancel: false,
      uploadDecision: false,
    });
  });

  it("cancelled: no Export PDF, no Edit, no Cancel, no Upload", () => {
    expect(rowActions({ ...started, status: "CANCELLED" }, true, now)).toEqual({
      view: true,
      exportPdf: false,
      edit: false,
      cancel: false,
      uploadDecision: false,
    });
  });

  it("completed: Export only (plus Upload decision for its people)", () => {
    const r = rowActions({ ...future, status: "COMPLETED" }, true, now);
    expect([r.exportPdf, r.edit, r.cancel, r.uploadDecision]).toEqual([true, false, false, true]);
  });

  it("scheduled but already ended: Cancel, no Edit", () => {
    const r = rowActions(
      { status: "SCHEDULED", startAt: "2026-11-16T05:00:00Z", endAt: "2026-11-16T06:00:00Z" },
      true,
      now,
    );
    expect([r.edit, r.cancel]).toEqual([false, true]);
  });

  it("organizer or internal chair by role; participants by role", () => {
    expect(isOrganizerOrChair("ORGANIZER")).toBe(true);
    expect(isOrganizerOrChair("CHAIR")).toBe(true);
    expect(isOrganizerOrChair("MEMBER")).toBe(false);
    expect(isOrganizerOrChair(null)).toBe(false);
    expect(isParticipant("MEMBER")).toBe(true);
    expect(isParticipant(null)).toBe(false);
  });
});

describe("Upload decision (v1.11)", () => {
  it("a member of a started meeting may upload", () => {
    expect(rowActions(started, false, now, true).uploadDecision).toBe(true);
  });
  it("not before the start, not for non-participants (admins), not at 10 files", () => {
    expect(rowActions(future, true, now, true).uploadDecision).toBe(false);
    expect(rowActions(started, false, now, false).uploadDecision).toBe(false);
    expect(rowActions({ ...started, decisionFileCount: 10 }, true, now, true).uploadDecision).toBe(
      false,
    );
    expect(rowActions({ ...started, decisionFileCount: 9 }, true, now, true).uploadDecision).toBe(
      true,
    );
  });
});
