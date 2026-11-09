import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { MeetingRole, MeetingStatus } from "@/lib/types";
import { t } from "@/messages";

const statusTone: Record<MeetingStatus, BadgeTone> = {
  SCHEDULED: "green",
  COMPLETED: "blue",
  CANCELLED: "neutral",
};

export function StatusBadge({ status }: { status: MeetingStatus }) {
  return <Badge tone={statusTone[status]}>{t.meeting.status[status]}</Badge>;
}

export function RoleBadge({ role }: { role: MeetingRole | null }) {
  if (!role) return null;
  return <Badge tone={role === "ORGANIZER" ? "amber" : "neutral"}>{t.meeting.myRole[role]}</Badge>;
}

export function ConflictBadge() {
  return (
    <Badge tone="red" title={t.meeting.pendingConflictLong}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3" fill="currentColor">
        <path d="M10 2 1 18h18L10 2Zm-.9 6h1.8v4.5H9.1V8Zm0 6h1.8v1.8H9.1V14Z" />
      </svg>
      {t.meeting.pendingConflict}
      <span className="sr-only">: {t.meeting.pendingConflictLong}</span>
    </Badge>
  );
}
