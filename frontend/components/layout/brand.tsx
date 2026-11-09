import Link from "next/link";
import { t } from "@/messages";

/** App name as text (no logo icon in the UI, SPEC.md §13.5). */
export function Brand({
  href = "/dashboard",
  compact = false,
}: {
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} className="block rounded-md leading-tight">
      <span className="block text-lg font-bold text-brand-800">{t.app.name}</span>
      {!compact && <span className="block text-xs text-slate-500">{t.app.org}</span>}
    </Link>
  );
}
