import type { Metadata } from "next";
import { Suspense } from "react";
import { UsersList } from "@/components/admin/users/users-list";
import { LoadingBlock } from "@/components/ui/spinner";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.admin.usersTitle };

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <UsersList />
    </Suspense>
  );
}
