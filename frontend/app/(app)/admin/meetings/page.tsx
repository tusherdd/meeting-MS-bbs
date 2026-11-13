import type { Metadata } from "next";
import { MeetingsListView } from "@/components/meetings/meetings-list-view";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.admin.meetingsTitle };

export default function Page() {
  return <MeetingsListView scope="all" />;
}
