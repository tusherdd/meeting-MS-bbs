import type { Metadata } from "next";
import { AdminOverview } from "@/components/admin/admin-overview";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.admin.overviewTitle };

export default function Page() {
  return <AdminOverview />;
}
