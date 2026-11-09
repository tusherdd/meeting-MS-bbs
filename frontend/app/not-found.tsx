import { LinkButton } from "@/components/ui/button";
import { t } from "@/messages";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-bold text-brand-700">৪০৪</p>
      <h1 className="text-xl font-semibold">{t.errors.notFoundTitle}</h1>
      <p className="max-w-md text-slate-600">{t.errors.notFoundBody}</p>
      <LinkButton href="/dashboard" className="mt-2">
        {t.common.goToDashboard}
      </LinkButton>
    </main>
  );
}
