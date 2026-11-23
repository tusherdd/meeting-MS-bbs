import { describe, expect, it } from "vitest";
import {
  conflictCardActions,
  isOrganizerOrChair,
  isParticipant,
  rowActions,
} from "@/lib/row-actions";

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

describe("row menu items (v1.10, v1.13)", () => {
  it("organizer or chair of a scheduled future meeting: View, Edit, Cancel", () => {
    expect(rowActions(future, true, now)).toEqual({
      view: true,
      notice: false,
      noticeAction: null,
      edit: true,
      cancel: true,
      minutes: null,
    });
  });

  it("a plain member (or an admin who is neither): only View", () => {
    expect(rowActions(future, false, now)).toEqual({
      view: true,
      notice: false,
      noticeAction: null,
      edit: false,
      cancel: false,
      minutes: null,
    });
  });

  it("cancelled: no Edit, no Cancel, no Upload", () => {
    expect(rowActions({ ...started, status: "CANCELLED" }, true, now)).toEqual({
      view: true,
      notice: false,
      noticeAction: null,
      edit: false,
      cancel: false,
      minutes: null,
    });
  });

  it("completed: Upload minutes for its people, no Edit / Cancel", () => {
    const r = rowActions({ ...future, status: "COMPLETED" }, true, now);
    expect([r.edit, r.cancel, r.minutes]).toEqual([false, false, "upload"]);
  });

  it('v1.13: "Meeting notice" appears ONLY when a notice file exists — for everyone who sees the row, also when cancelled', () => {
    expect(rowActions(future, false, now).notice).toBe(false);
    expect(rowActions({ ...future, hasNotice: false }, true, now).notice).toBe(false);
    expect(rowActions({ ...future, hasNotice: true }, false, now).notice).toBe(true);
    expect(rowActions({ ...future, hasNotice: true }, true, now).notice).toBe(true);
    expect(
      rowActions({ ...started, status: "CANCELLED", hasNotice: true }, false, now).notice,
    ).toBe(true);
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

describe("v1.17 part 2: ONE minutes item by status (every menu)", () => {
  const minutes = (m: Parameters<typeof rowActions>[0], participant: boolean) =>
    rowActions(m, false, now, participant).minutes;

  it("Pending (no file): Upload minutes for its people of a started, not cancelled meeting", () => {
    expect(minutes(started, true)).toBe("upload");
    expect(minutes({ ...started, decisionFileCount: 0 }, true)).toBe("upload");
    expect(minutes({ ...future, status: "COMPLETED" }, true)).toBe("upload");
    // not before the start, not for non-participants (admins, report viewers), not when cancelled
    expect(minutes(future, true)).toBeNull();
    expect(minutes(started, false)).toBeNull();
    expect(minutes({ ...started, status: "CANCELLED" }, true)).toBeNull();
  });

  it("Complete (at least one file): View minutes for everyone who sees the row, never Upload", () => {
    const done = { ...started, decisionFileCount: 2, decisionViewable: true };
    expect(minutes(done, true)).toBe("view");
    expect(minutes(done, false)).toBe("view");
    // unknown type → the panel decides (DOCX entries only offer Download there)
    expect(minutes({ ...started, decisionFileCount: 1 }, true)).toBe("view");
    // also for a cancelled meeting that already has minutes
    expect(minutes({ ...done, status: "CANCELLED" }, false)).toBe("view");
  });

  it("Complete with DOCX files only: Download minutes", () => {
    expect(minutes({ ...started, decisionFileCount: 1, decisionViewable: false }, true)).toBe(
      "download",
    );
  });

  it("Edit / Cancel stay with the organizer or the chair", () => {
    const mine = rowActions({ ...future, decisionFileCount: 1 }, true, now, true);
    expect([mine.edit, mine.cancel, mine.minutes]).toEqual([true, true, "view"]);
  });
});

describe("v1.17: notice item by type (file viewer panel)", () => {
  it("PDF / image → view, DOCX or unknown → download, none → null", () => {
    const at = (noticeMime: string | null | undefined, hasNotice = true) =>
      rowActions({ ...future, hasNotice, noticeMime }, false, now).noticeAction;
    expect(at("application/pdf")).toBe("view");
    expect(at("image/jpeg")).toBe("view");
    expect(at("image/png")).toBe("view");
    expect(at("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(
      "download",
    );
    expect(at(undefined)).toBe("download");
    expect(at("application/pdf", false)).toBeNull();
  });
});

describe("v1.19: minutes not required (SPEC.md §6.9)", () => {
  it("no files: the participant still gets Upload once the meeting started", () => {
    expect(rowActions({ ...started, minutesRequired: false }, false, now, true).minutes).toBe(
      "upload",
    );
  });

  it("with files: View, exactly as with minutes required", () => {
    expect(
      rowActions({ ...started, minutesRequired: false, decisionFileCount: 1 }, false, now, true)
        .minutes,
    ).toBe("view");
  });

  it("not started: no minutes item, either way", () => {
    expect(rowActions({ ...future, minutesRequired: false }, true, now).minutes).toBeNull();
  });
});

// Regression (2026-11-23): the internal chair edits and cancels exactly like the organizer (v1.10).
describe("regression: the internal chair can edit and cancel", () => {
  it("row menu: myRole CHAIR gets Edit and Cancel on a scheduled meeting", () => {
    const can = rowActions(future, isOrganizerOrChair("CHAIR"), now, isParticipant("CHAIR"));
    expect(can.edit).toBe(true);
    expect(can.cancel).toBe(true);
  });

  it("row menu: a running meeting can still be edited and cancelled by the chair", () => {
    const can = rowActions(started, isOrganizerOrChair("CHAIR"), now);
    expect(can.edit).toBe(true);
    expect(can.cancel).toBe(true);
  });

  const card = (over: Partial<{ organizedByMe: boolean; chairedByMe: boolean; status: string }>) => ({
    status: "PENDING",
    lowerMeeting: { status: "SCHEDULED", organizedByMe: false, chairedByMe: false, ...over },
  });

  it("concurrent meetings card: organizer and chair get Cancel / Change time", () => {
    expect(conflictCardActions(card({ organizedByMe: true }))).toBe(true);
    expect(conflictCardActions(card({ chairedByMe: true }))).toBe(true);
  });

  it("concurrent meetings card: a member, a resolved conflict or a cancelled meeting get nothing", () => {
    expect(conflictCardActions(card({}))).toBe(false);
    expect(conflictCardActions({ ...card({ chairedByMe: true }), status: "RESOLVED" })).toBe(false);
    expect(conflictCardActions(card({ chairedByMe: true, status: "CANCELLED" }))).toBe(false);
  });
});
