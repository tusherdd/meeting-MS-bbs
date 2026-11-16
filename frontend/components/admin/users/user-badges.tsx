"use client";

import { Badge } from "@/components/ui/badge";
import type { Role } from "@/lib/types";
import { useT } from "@/providers/locale-provider";

export function RoleBadge({ role }: { role: Role }) {
  const t = useT();
  return <Badge tone={role === "OFFICER" ? "neutral" : "blue"}>{t.roles[role]}</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  const t = useT();
  return (
    <Badge tone={active ? "green" : "neutral"}>{active ? t.admin.active : t.admin.inactive}</Badge>
  );
}

/** "Default Password": হ্যাঁ (amber: anyone who knows it can log in) / না. */
export function DefaultPasswordBadge({ isDefault }: { isDefault: boolean }) {
  const t = useT();
  return (
    <Badge tone={isDefault ? "amber" : "neutral"}>{isDefault ? t.admin.yes : t.admin.no}</Badge>
  );
}

export function ProtectedBadge() {
  const t = useT();
  return (
    <Badge tone="blue" title={t.admin.protectedHint}>
      {t.admin.protected}
      <span className="sr-only">: {t.admin.protectedHint}</span>
    </Badge>
  );
}
