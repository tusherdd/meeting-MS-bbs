import type { Metadata } from "next";
import { Suspense } from "react";
import { MyReportView } from "@/components/reports/my-report-view";
import { LoadingBlock } from "@/components/ui/spinner";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).reports.title };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <MyReportView />
    </Suspense>
  );
}
