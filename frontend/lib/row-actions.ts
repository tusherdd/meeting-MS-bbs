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
 * - Upload minutes (v1.11, SPEC.md §13.19): the meeting's people (organizer, internal chair,
 *   members — not admins as such), only when an upload is allowed: started (or completed), not
 *   cancelled, fewer than MAX_DECISION_FILES files.
 */
import { opensInPanel } from "./file-viewer";

export const MAX_DECISION_FILES = 10;

export interface RowMeeting {
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED";
  startAt: string;
  endAt: string;
  /** Number of decision files; unknown → the backend still checks the limit. */
  decisionFileCount?: number;
  /** v1.13: an uploaded notice exists; unknown → no menu item. */
  hasNotice?: boolean;
  /** v1.17: the notice's mime type; unknown → "Download notice" (the bytes decide nothing here). */
  noticeMime?: string | null;
}

export interface RowActions {
  view: boolean;
  notice: boolean;
  /** v1.17: "view" = PDF / image in the file viewer panel; "download" = DOCX; null = no notice. */
  noticeAction: "view" | "download" | null;
  edit: boolean;
  cancel: boolean;
  uploadDecision: boolean;
  /** v1.15 office report: "কার্যবিবরণী দেখুন" (view / download only) when minutes exist. */
  viewDecision: boolean;
}

/**
 * "default": the usual menu. "officeReport" (v1.15, SPEC.md §13.21): View details, Meeting notice,
 * "View minutes" only when minutes exist (never "Upload minutes"), Edit / Cancel only for the
 * organizer or the chair.
 */
export type RowMenuMode = "default" | "officeReport";

export function rowActions(
  meeting: RowMeeting,
  mine: boolean,
  now = new Date(),
  participant = mine,
  mode: RowMenuMode = "default",
): RowActions {
  const scheduled = meeting.status === "SCHEDULED";
  const started = meeting.status === "COMPLETED" || now >= new Date(meeting.startAt);
  return {
    view: true,
    notice: meeting.hasNotice === true,
    noticeAction:
      meeting.hasNotice === true ? (opensInPanel(meeting.noticeMime) ? "view" : "download") : null,
    edit: mine && scheduled && now < new Date(meeting.endAt),
    cancel: mine && scheduled,
    viewDecision: mode === "officeReport" && (meeting.decisionFileCount ?? 0) > 0,
    uploadDecision:
      mode === "default" &&
      participant &&
      meeting.status !== "CANCELLED" &&
      started &&
      (meeting.decisionFileCount ?? 0) < MAX_DECISION_FILES,
  };
}

/** The viewer is one of the meeting's people (organizer, internal chair or member). */
export function isParticipant(myRole: string | null | undefined): boolean {
  return myRole === "ORGANIZER" || myRole === "CHAIR" || myRole === "MEMBER";
}

/** The viewer organizes the meeting or is its internal chair (a guest chair has no account). */
export function isOrganizerOrChair(myRole: string | null | undefined): boolean {
  return myRole === "ORGANIZER" || myRole === "CHAIR";
}
