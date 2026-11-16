import type { Metadata } from "next";
import { MeetingsListView } from "@/components/meetings/meetings-list-view";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).meetingsList.title };
}

export default function Page() {
  return <MeetingsListView />;
}
