import type { Metadata } from "next";
import { ConflictsView } from "@/components/conflicts/conflicts-view";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.conflictsTitle };
}

export default function Page() {
  return <ConflictsView scope="all" />;
}
