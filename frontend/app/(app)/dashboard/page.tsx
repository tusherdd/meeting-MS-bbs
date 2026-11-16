import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).dashboard.title };
}

export default function Page() {
  return <DashboardView />;
}
