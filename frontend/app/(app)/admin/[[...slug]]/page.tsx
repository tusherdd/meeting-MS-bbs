import type { Metadata } from "next";
import { AdminOnly } from "@/components/layout/admin-only";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.placeholders.admin };

/** Built in F3. Until then the page stays empty for admins (owner decision 2026-11-09). */
export default function Page() {
  return <AdminOnly>{null}</AdminOnly>;
}
