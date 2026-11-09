import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.dashboard.title };

export default function Page() {
  return <DashboardView />;
}
