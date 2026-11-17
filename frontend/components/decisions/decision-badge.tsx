"use client";

import { Badge } from "@/components/ui/badge";
import type { DecisionStatus } from "@/lib/types";
import { useT } from "@/providers/locale-provider";

/** v1.11: "Pending" (amber) or "Complete" (green); nothing when the meeting has no decision status. */
export function DecisionBadge({ status }: { status: DecisionStatus | null | undefined }) {
  const t = useT();
  if (!status) return null;
  return (
    <Badge tone={status === "COMPLETE" ? "green" : "amber"}>
      <span data-testid="decision-status">{t.decisions.status[status]}</span>
    </Badge>
  );
}
