import clsx from "clsx";
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "green" | "blue" | "amber" | "red";

/** v1.8: soft background with dark text in every tone (SPEC.md §13.16). */
const tones: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-800 ring-slate-300",
  green: "bg-brand-100 text-brand-900 ring-brand-200",
  blue: "bg-sky-50 text-sky-900 ring-sky-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-300",
  red: "bg-red-50 text-red-800 ring-red-200",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs leading-5 font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
