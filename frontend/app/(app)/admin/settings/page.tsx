import type { Metadata } from "next";
import { SettingsAdmin } from "@/components/admin/settings-admin";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.settings.title };
}

export default function Page() {
  return <SettingsAdmin />;
}
