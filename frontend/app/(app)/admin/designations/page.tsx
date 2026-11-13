import type { Metadata } from "next";
import { CatalogAdmin } from "@/components/admin/catalog-admin";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.admin.designationsTitle };

export default function Page() {
  return <CatalogAdmin kind="designation" />;
}
