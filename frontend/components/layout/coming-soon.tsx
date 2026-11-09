import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { t } from "@/messages";

/** Placeholder for pages of later steps. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
          {t.common.comingSoon}
        </span>
        <p className="max-w-md text-slate-600">{t.common.comingSoonBody}</p>
        <LinkButton href="/dashboard" variant="secondary" className="mt-2">
          {t.common.goToDashboard}
        </LinkButton>
      </Card>
    </div>
  );
}
