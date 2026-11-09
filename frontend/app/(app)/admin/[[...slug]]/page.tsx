import type { Metadata } from "next";
import { AdminOnly } from "@/components/layout/admin-only";
import { ComingSoon } from "@/components/layout/coming-soon";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.placeholders.admin };

export default function Page() {
  return (
    <AdminOnly>
      <ComingSoon title={t.placeholders.admin} />
    </AdminOnly>
  );
}
