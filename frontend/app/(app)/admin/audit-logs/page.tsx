import type { Metadata } from "next";
import { Suspense } from "react";
import { AuditLogs } from "@/components/admin/audit-logs";
import { LoadingBlock } from "@/components/ui/spinner";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.auditTitle };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AuditLogs />
    </Suspense>
  );
}
