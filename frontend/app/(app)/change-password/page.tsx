import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).auth.changeTitle };
}

export default function Page() {
  return <ChangePasswordForm />;
}
