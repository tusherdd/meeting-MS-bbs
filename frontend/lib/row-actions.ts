/**
 * v1.10 (SPEC.md §13.18): which items the three-dot menu of a meeting row shows. The backend
 * checks every action again; this only hides what would be refused.
 * - View details: everyone who sees the row.
 * - Meeting notice (v1.13, SPEC.md §6.8): everyone who sees the row, ONLY when an uploaded notice
 *   exists (`hasNotice`), also for cancelled meetings. (The generated "Export PDF" of v1.10 was
 *   removed in v1.13.)
 *   v1.17: a PDF or image notice reads "নোটিশ দেখুন" (file viewer panel), a DOCX "নোটিশ ডাউনলোড"
 *   (direct download), decided by `noticeMime`.
 * - Edit / Cancel: ONLY the organizer and the internal chair (`mine`), with the usual status
 *   rules (edit: scheduled and not ended yet; cancel: scheduled). Admins keep their rights on the
 *   detail page; the row menu does not offer them Edit / Cancel for other people's meetings.
 * - Minutes (v1.17 part 2, SPEC.md §13.18): ONE item, by the minutes status —
 *   - Pending (no minutes file): "কার্যবিবরণী আপলোড" / "Upload minutes" for the meeting's people
 *     (organizer, internal chair, members — not admins as such), only when an upload is allowed:
 *     started (or completed), not cancelled;
 *   - Complete (at least one file): "কার্যবিবরণী দেখুন" / "View minutes" (file viewer panel) for
 *     everyone who sees the row, or "কার্যবিবরণী ডাউনলোড" / "Download minutes" when every file is a
 *     DOCX (`decisionViewable` false). Never "Upload minutes" then (more files: from the panel's
 *     "ফাইল যোগ / মুছুন" link or the minutes page).
 *   The same rules in every menu: dashboard, meetings list, minutes page, my report, office report.
 */
import { opensInPanel } from "./file-viewer";

export interface RowMeeting {
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED";
  startAt: string;
  endAt: string;
  /** Number of minutes files; unknown → treated as none. */
  decisionFileCount?: number;
  /** v1.17: a minutes file is a PDF or an image; false with files = DOCX only; unknown → view. */
  decisionViewable?: boolean;
  /** v1.13: an uploaded notice exists; unknown → no menu item. */
  hasNotice?: boolean;
  /** v1.17: the notice's mime type; unknown → "Download notice" (the bytes decide nothing here). */
  noticeMime?: string | null;
  /**
   * v1.19: minutes required yes / no. Deliberately NOT used: uploading stays allowed when minutes
   * are not required, so the menu offers "Upload" / "View" by the file count alone (SPEC.md §6.9).
   */
  minutesRequired?: boolean;
}

/** v1.17: the one minutes item of the row menu (null = none). */
export type MinutesAction = "upload" | "view" | "download" | null;

export interface RowActions {
  view: boolean;
  notice: boolean;
  /** v1.17: "view" = PDF / image in the file viewer panel; "download" = DOCX; null = no notice. */
  noticeAction: "view" | "download" | null;
  edit: boolean;
  cancel: boolean;
  minutes: MinutesAction;
}

export function rowActions(
  meeting: RowMeeting,
  mine: boolean,
  now = new Date(),
  participant = mine,
): RowActions {
  const scheduled = meeting.status === "SCHEDULED";
  const started = meeting.status === "COMPLETED" || now >= new Date(meeting.startAt);
  const complete = (meeting.decisionFileCount ?? 0) > 0;
  const minutes: MinutesAction = complete
    ? meeting.decisionViewable === false
      ? "download"
      : "view"
    : participant && meeting.status !== "CANCELLED" && started
      ? "upload"
      : null;
  return {
    view: true,
    notice: meeting.hasNotice === true,
    noticeAction:
      meeting.hasNotice === true ? (opensInPanel(meeting.noticeMime) ? "view" : "download") : null,
    edit: mine && scheduled && now < new Date(meeting.endAt),
    cancel: mine && scheduled,
    minutes,
  };
}

/**
 * Concurrent meetings card (`/conflicts`): "সভা বাতিল করুন" / "সময় পরিবর্তন করুন" for the lower
 * meeting while the conflict is PENDING and the meeting is SCHEDULED — for its organizer AND its
 * internal chair (v1.10, SPEC.md §6.3: the chair edits and cancels like the organizer).
 */
export function conflictCardActions(conflict: {
  status: string;
  lowerMeeting: { status: string; organizedByMe: boolean; chairedByMe: boolean };
}): boolean {
  const lower = conflict.lowerMeeting;
  return (
    conflict.status === "PENDING" &&
    lower.status === "SCHEDULED" &&
    (lower.organizedByMe || lower.chairedByMe)
  );
}

/** The viewer is one of the meeting's people (organizer, internal chair or member). */
export function isParticipant(myRole: string | null | undefined): boolean {
  return myRole === "ORGANIZER" || myRole === "CHAIR" || myRole === "MEMBER";
}

/** The viewer organizes the meeting or is its internal chair (a guest chair has no account). */
export function isOrganizerOrChair(myRole: string | null | undefined): boolean {
  return myRole === "ORGANIZER" || myRole === "CHAIR";
}
