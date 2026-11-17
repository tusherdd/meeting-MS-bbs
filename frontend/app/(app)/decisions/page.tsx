import type { Metadata } from "next";
import { DecisionsView } from "@/components/decisions/decisions-view";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).decisions.title };
}

export default function Page() {
  return <DecisionsView />;
}
