import type { Metadata } from "next";
import { EditMeeting } from "@/components/meetings/edit-meeting";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).meetingForm.editTitle };
}

export default async function Page({ params }: PageProps<"/meetings/[id]/edit">) {
  const { id } = await params;
  return <EditMeeting id={id} />;
}
