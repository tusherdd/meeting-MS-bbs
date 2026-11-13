import type { Metadata } from "next";
import { ConflictsView } from "@/components/conflicts/conflicts-view";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.admin.conflictsTitle };

export default function Page() {
  return <ConflictsView scope="all" />;
}
