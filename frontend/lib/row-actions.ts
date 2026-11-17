/**
 * v1.10 (SPEC.md §13.18): which items the three-dot menu of a meeting row shows. The backend
 * checks every action again; this only hides what would be refused.
 * - View details: everyone who sees the row.
 * - Export PDF: everyone who sees the row, except for cancelled meetings.
 * - Edit / Cancel: ONLY the organizer and the internal chair (`mine`), with the usual status
 *   rules (edit: scheduled and not ended yet; cancel: scheduled). Admins keep their rights on the
 *   detail page; the row menu does not offer them Edit / Cancel for other people's meetings.
 * - Upload decision (v1.11, SPEC.md §13.19): the meeting's people (organizer, internal chair,
 *   members — not admins as such), only when an upload is allowed: started (or completed), not
 *   cancelled, fewer than MAX_DECISION_FILES files.
 */
export const MAX_DECISION_FILES = 10;

export interface RowMeeting {
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED";
  startAt: string;
  endAt: string;
  /** Number of decision files; unknown → the backend still checks the limit. */
  decisionFileCount?: number;
}

export interface RowActions {
  view: boolean;
  exportPdf: boolean;
  edit: boolean;
  cancel: boolean;
  uploadDecision: boolean;
}

export function rowActions(
  meeting: RowMeeting,
  mine: boolean,
  now = new Date(),
  participant = mine,
): RowActions {
  const scheduled = meeting.status === "SCHEDULED";
  const started = meeting.status === "COMPLETED" || now >= new Date(meeting.startAt);
  return {
    view: true,
    exportPdf: meeting.status !== "CANCELLED",
    edit: mine && scheduled && now < new Date(meeting.endAt),
    cancel: mine && scheduled,
    uploadDecision:
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
