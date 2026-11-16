import type { Metadata } from "next";
import { CatalogAdmin } from "@/components/admin/catalog-admin";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.wingsTitle };
}

export default function Page() {
  return <CatalogAdmin kind="wing" />;
}
