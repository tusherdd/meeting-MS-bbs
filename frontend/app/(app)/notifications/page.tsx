import type { Metadata } from "next";
import { NotificationsView } from "@/components/notifications/notifications-view";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.notificationsPage.title };

export default function Page() {
  return <NotificationsView />;
}
