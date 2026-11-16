import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailOutbox } from "@/components/admin/email-outbox";
import { LoadingBlock } from "@/components/ui/spinner";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.outboxTitle };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <EmailOutbox />
    </Suspense>
  );
}
