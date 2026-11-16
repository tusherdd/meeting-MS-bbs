import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui/spinner";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).auth.setTitle };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewPasswordForm mode="set" />
    </Suspense>
  );
}
