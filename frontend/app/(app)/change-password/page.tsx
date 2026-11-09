import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.auth.changeTitle };

export default function Page() {
  return <ChangePasswordForm />;
}
