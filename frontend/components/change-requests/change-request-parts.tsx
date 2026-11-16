"use client";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { ChangeRequest, ChangeRequestStatus } from "@/lib/types";
import type { Messages } from "@/messages";
import { useT } from "@/providers/locale-provider";
import type { NameHelpers } from "@/lib/display-name";

const statusTone: Record<ChangeRequestStatus, BadgeTone> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "neutral",
};

export function RequestStatusBadge({ status }: { status: ChangeRequestStatus }) {
  const t = useT();
  return <Badge tone={statusTone[status]}>{t.profile.requestStatus[status]}</Badge>;
}

/** A login email, or the designation name (priority numbers only on the admin designations page). */
export function changeValueText(
  type: ChangeRequest["type"],
  value: ChangeRequest["requestedValue"],
  t: Messages,
  names: NameHelpers,
): string {
  if (type === "LOGIN_EMAIL") return value.loginEmail ?? t.profile.none;
  const d = value.designation;
  return d ? names.of(d) : t.profile.none;
}
