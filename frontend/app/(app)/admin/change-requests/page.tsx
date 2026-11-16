import type { Metadata } from "next";
import { Suspense } from "react";
import { ChangeRequestsAdmin } from "@/components/admin/change-requests-admin";
import { LoadingBlock } from "@/components/ui/spinner";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.changeRequestsTitle };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ChangeRequestsAdmin />
    </Suspense>
  );
}
