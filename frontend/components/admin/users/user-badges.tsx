import { Badge } from "@/components/ui/badge";
import type { Role } from "@/lib/types";
import { t } from "@/messages";

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={role === "OFFICER" ? "neutral" : "blue"}>{t.roles[role]}</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? "green" : "neutral"}>{active ? t.admin.active : t.admin.inactive}</Badge>
  );
}

/** "ডিফল্ট পাসওয়ার্ড": হ্যাঁ (amber: anyone who knows it can log in) / না. */
export function DefaultPasswordBadge({ isDefault }: { isDefault: boolean }) {
  return (
    <Badge tone={isDefault ? "amber" : "neutral"}>{isDefault ? t.admin.yes : t.admin.no}</Badge>
  );
}

export function ProtectedBadge() {
  return (
    <Badge tone="blue" title={t.admin.protectedHint}>
      {t.admin.protected}
      <span className="sr-only">: {t.admin.protectedHint}</span>
    </Badge>
  );
}
