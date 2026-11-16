import type { Metadata } from "next";
import { NotificationsView } from "@/components/notifications/notifications-view";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).notificationsPage.title };
}

export default function Page() {
  return <NotificationsView />;
}
