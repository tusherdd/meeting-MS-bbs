import clsx from "clsx";
import Link from "next/link";
import type { CSSProperties } from "react";
import { formatTime, formatTimeRange } from "@/lib/format";
import type { MeetingStatus, MeetingSummary } from "@/lib/types";
import { t } from "@/messages";

export const statusColors: Record<MeetingStatus, string> = {
  SCHEDULED: "bg-brand-50 text-brand-900 border-brand-300 hover:bg-brand-100",
  COMPLETED: "bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-300 line-through hover:bg-slate-200",
};

function label(m: MeetingSummary, conflict: boolean) {
  return [
    m.title,
    formatTimeRange(m.startAt, m.endAt),
    t.meeting.status[m.status],
    conflict ? t.meeting.pendingConflictLong : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** A meeting block in the week grid (absolutely positioned by the caller). */
export function GridMeeting({
  meeting,
  conflict,
  style,
  compact,
}: {
  meeting: MeetingSummary;
  conflict: boolean;
  style: CSSProperties;
  compact: boolean;
}) {
  return (
    <Link
      href={`/meetings/${meeting.id}`}
      style={style}
      aria-label={label(meeting, conflict)}
      data-testid="calendar-meeting"
      className={clsx(
        "absolute z-10 overflow-hidden rounded-md border px-1.5 py-0.5 text-xs leading-tight shadow-sm",
        statusColors[meeting.status],
        conflict && "border-2 border-red-600",
      )}
    >
      <span className="block truncate font-semibold">{meeting.title}</span>
      {!compact && (
        <span className="block truncate">{formatTimeRange(meeting.startAt, meeting.endAt)}</span>
      )}
    </Link>
  );
}

/** One line meeting (month cells, "other times" row, phone day list). */
export function LineMeeting({ meeting, conflict }: { meeting: MeetingSummary; conflict: boolean }) {
  return (
    <Link
      href={`/meetings/${meeting.id}`}
      aria-label={label(meeting, conflict)}
      data-testid="calendar-meeting"
      className={clsx(
        "block truncate rounded border px-1.5 py-0.5 text-xs",
        statusColors[meeting.status],
        conflict && "border-2 border-red-600",
      )}
    >
      <span className="font-medium">{formatTime(meeting.startAt)}</span> {meeting.title}
    </Link>
  );
}
