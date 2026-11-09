import type { Metadata } from "next";
import { EditMeeting } from "@/components/meetings/edit-meeting";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.meetingForm.editTitle };

export default async function Page({ params }: PageProps<"/meetings/[id]/edit">) {
  const { id } = await params;
  return <EditMeeting id={id} />;
}
