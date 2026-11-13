import type { Metadata } from "next";
import { Suspense } from "react";
import { ChangeRequestsAdmin } from "@/components/admin/change-requests-admin";
import { LoadingBlock } from "@/components/ui/spinner";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.admin.changeRequestsTitle };

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ChangeRequestsAdmin />
    </Suspense>
  );
}
