import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui/spinner";
import { LoginForm } from "@/components/auth/login-form";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.auth.loginTitle };

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <LoginForm />
    </Suspense>
  );
}
