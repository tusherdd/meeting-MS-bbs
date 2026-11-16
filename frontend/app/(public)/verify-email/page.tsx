import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui/spinner";
import { VerifyEmail } from "@/components/auth/verify-email";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).auth.verifyTitle };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <VerifyEmail />
    </Suspense>
  );
}
