import type { Metadata } from "next";
import { Suspense } from "react";
import { NewMeeting } from "@/components/meetings/new-meeting";
import { LoadingBlock } from "@/components/ui/spinner";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).meetingForm.newTitle };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewMeeting />
    </Suspense>
  );
}
