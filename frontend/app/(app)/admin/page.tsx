import type { Metadata } from "next";
import { AdminOverview } from "@/components/admin/admin-overview";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.overviewTitle };
}

export default function Page() {
  return <AdminOverview />;
}
