import type { Metadata } from "next";
import { UserForm } from "@/components/admin/users/user-form";
import { getMessages } from "@/messages/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages()).admin.createTitle };
}

export default async function Page() {
  const t = await getMessages();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t.admin.createTitle}</h1>
      <UserForm />
    </div>
  );
}
