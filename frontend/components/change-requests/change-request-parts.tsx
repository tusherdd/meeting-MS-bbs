import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { ChangeRequest, ChangeRequestStatus } from "@/lib/types";
import { t } from "@/messages";

const statusTone: Record<ChangeRequestStatus, BadgeTone> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "neutral",
};

export function RequestStatusBadge({ status }: { status: ChangeRequestStatus }) {
  return <Badge tone={statusTone[status]}>{t.profile.requestStatus[status]}</Badge>;
}

/** A login email, or the designation name (priority numbers only on the admin designations page). */
export function changeValueText(
  type: ChangeRequest["type"],
  value: ChangeRequest["requestedValue"],
): string {
  if (type === "LOGIN_EMAIL") return value.loginEmail ?? t.profile.none;
  const d = value.designation;
  return d ? d.nameBn : t.profile.none;
}
