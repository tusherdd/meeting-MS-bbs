import type { Metadata } from "next";
import { Suspense } from "react";
import { AuditLogs } from "@/components/admin/audit-logs";
import { LoadingBlock } from "@/components/ui/spinner";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.admin.auditTitle };

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AuditLogs />
    </Suspense>
  );
}
