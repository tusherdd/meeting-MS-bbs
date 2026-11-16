import type { Metadata } from "next";
import { Suspense } from "react";
import { OfficeReportView } from "@/components/reports/office-report-view";
import { LoadingBlock } from "@/components/ui/spinner";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).reports.officeTitle };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <OfficeReportView />
    </Suspense>
  );
}
