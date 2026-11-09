import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui/spinner";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.auth.forgotTitle };

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
