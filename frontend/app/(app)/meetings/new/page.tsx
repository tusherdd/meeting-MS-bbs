import type { Metadata } from "next";
import { Suspense } from "react";
import { NewMeeting } from "@/components/meetings/new-meeting";
import { LoadingBlock } from "@/components/ui/spinner";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.meetingForm.newTitle };

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewMeeting />
    </Suspense>
  );
}
