import type { Metadata } from "next";
import { MeetingDetailView } from "@/components/meetings/meeting-detail-view";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.placeholders.meetingDetail };

export default async function Page({ params }: PageProps<"/meetings/[id]">) {
  const { id } = await params;
  return <MeetingDetailView id={id} />;
}
