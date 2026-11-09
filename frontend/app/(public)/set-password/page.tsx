import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui/spinner";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.auth.setTitle };

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewPasswordForm mode="set" />
    </Suspense>
  );
}
