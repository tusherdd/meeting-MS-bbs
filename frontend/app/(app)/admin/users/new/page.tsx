import type { Metadata } from "next";
import { UserForm } from "@/components/admin/users/user-form";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.admin.createTitle };

export default function Page() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t.admin.createTitle}</h1>
      <UserForm />
    </div>
  );
}
