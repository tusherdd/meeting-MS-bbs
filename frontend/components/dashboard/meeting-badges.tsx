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
      {t.meeting.pendingConflict}
      <span className="sr-only">: {t.meeting.pendingConflictLong}</span>
    </Badge>
  );
}
