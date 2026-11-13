import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
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

/** A login email, or "পদবি (অগ্রাধিকার n)". */
export function changeValueText(
  type: ChangeRequest["type"],
  value: ChangeRequest["requestedValue"],
): string {
  if (type === "LOGIN_EMAIL") return value.loginEmail ?? t.profile.none;
  const d = value.designation;
  return d ? t.profile.designationOption(d.nameBn, formatNumber(d.priority)) : t.profile.none;
}
