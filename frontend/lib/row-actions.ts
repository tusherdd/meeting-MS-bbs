/**
 * v1.10 (SPEC.md §13.18): which items the three-dot menu of a meeting row shows. The backend
 * checks every action again; this only hides what would be refused.
 * - View details: everyone who sees the row.
 * - Export PDF: everyone who sees the row, except for cancelled meetings.
 * - Edit / Cancel: ONLY the organizer and the internal chair (`mine`), with the usual status
 *   rules (edit: scheduled and not ended yet; cancel: scheduled). Admins keep their rights on the
 *   detail page; the row menu does not offer them Edit / Cancel for other people's meetings.
 */
export interface RowMeeting {
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED";
  endAt: string;
}

export interface RowActions {
  view: boolean;
  exportPdf: boolean;
  edit: boolean;
  cancel: boolean;
}

export function rowActions(meeting: RowMeeting, mine: boolean, now = new Date()): RowActions {
  const scheduled = meeting.status === "SCHEDULED";
  return {
    view: true,
    exportPdf: meeting.status !== "CANCELLED",
    edit: mine && scheduled && now < new Date(meeting.endAt),
    cancel: mine && scheduled,
  };
}

/** The viewer organizes the meeting or is its internal chair (a guest chair has no account). */
export function isOrganizerOrChair(myRole: string | null | undefined): boolean {
  return myRole === "ORGANIZER" || myRole === "CHAIR";
}
