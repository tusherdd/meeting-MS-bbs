import type { Metadata } from "next";
import { DecisionView } from "@/components/decisions/decision-view";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).decisions.title };
}

export default async function Page({ params }: PageProps<"/meetings/[id]/decision">) {
  const { id } = await params;
  return <DecisionView id={id} />;
}
