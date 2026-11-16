import type { Metadata } from "next";
import { Suspense } from "react";
import { UsersList } from "@/components/admin/users/users-list";
import { LoadingBlock } from "@/components/ui/spinner";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.usersTitle };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <UsersList />
    </Suspense>
  );
}
