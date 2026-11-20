import type { Metadata } from "next";
import { Suspense } from "react";
import { OfficeReportView } from "@/components/reports/office-report-view";
import { LoadingBlock } from "@/components/ui/spinner";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).officeReport.title };
}

/** v1.15: "অফিস রিপোর্ট" for admins, OFFICE and WING viewers (SPEC.md §6.10, §13.21). */
export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <OfficeReportView />
    </Suspense>
  );
}
