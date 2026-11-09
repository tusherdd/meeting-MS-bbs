import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui/spinner";
import { VerifyEmail } from "@/components/auth/verify-email";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.auth.verifyTitle };

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <VerifyEmail />
    </Suspense>
  );
}
