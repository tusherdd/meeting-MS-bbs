import type { Metadata } from "next";
import { ConflictsView } from "@/components/conflicts/conflicts-view";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.conflictsPage.title };

export default function Page() {
  return <ConflictsView />;
}
