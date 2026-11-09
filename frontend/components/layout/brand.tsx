import Link from "next/link";
import { t } from "@/messages";

/** App mark + name. */
export function Brand({
  href = "/dashboard",
  compact = false,
}: {
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-md">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-white"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none">
          <rect
            x="3.5"
            y="5"
            width="17"
            height="15"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path
            d="M3.5 9.5h17M8 3v4M16 3v4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="12" cy="14.5" r="2.2" fill="#f42a41" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block text-base font-semibold text-slate-900">{t.app.name}</span>
        {!compact && <span className="block text-xs text-slate-500">{t.app.org}</span>}
      </span>
    </Link>
  );
}
