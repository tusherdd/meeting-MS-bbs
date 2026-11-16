import type { Metadata } from "next";
import { MeetingDetailView } from "@/components/meetings/meeting-detail-view";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).placeholders.meetingDetail };
}

export default async function Page({ params }: PageProps<"/meetings/[id]">) {
  const { id } = await params;
  return <MeetingDetailView id={id} />;
}
