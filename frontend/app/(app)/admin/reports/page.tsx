import type { Metadata } from "next";
import { Suspense } from "react";
import { OfficeReportView } from "@/components/reports/office-report-view";
import { LoadingBlock } from "@/components/ui/spinner";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.reports.officeTitle };

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <OfficeReportView />
    </Suspense>
  );
}
