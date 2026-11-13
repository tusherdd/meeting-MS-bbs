import type { Metadata } from "next";
import { Suspense } from "react";
import { MyReportView } from "@/components/reports/my-report-view";
import { LoadingBlock } from "@/components/ui/spinner";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.reports.title };

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <MyReportView />
    </Suspense>
  );
}
