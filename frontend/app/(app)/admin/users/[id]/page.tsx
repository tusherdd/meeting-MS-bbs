import type { Metadata } from "next";
import { Suspense } from "react";
import { UserDetailView } from "@/components/admin/users/user-detail";
import { LoadingBlock } from "@/components/ui/spinner";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.admin.editTitle };

export default async function Page({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  return (
    <Suspense fallback={<LoadingBlock />}>
      <UserDetailView id={id} />
    </Suspense>
  );
}
