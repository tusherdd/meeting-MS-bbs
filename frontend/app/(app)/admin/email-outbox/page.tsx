import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailOutbox } from "@/components/admin/email-outbox";
import { LoadingBlock } from "@/components/ui/spinner";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.admin.outboxTitle };

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <EmailOutbox />
    </Suspense>
  );
}
