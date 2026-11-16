import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui/spinner";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).auth.forgotTitle };
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
