"use client";

import clsx from "clsx";
import { useT } from "@/providers/locale-provider";

/** Loading indicator as text (no icons in the UI, SPEC.md §13.5). */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  const t = useT();
  return (
    <span role="status" className={clsx("text-sm text-slate-600", className)}>
      {label ?? t.common.loading}
    </span>
  );
}

/** Centered loading text for whole sections or pages. */
export function LoadingBlock({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="flex items-center justify-center py-10 text-sm text-slate-500">
      <span role="status">{label ?? t.common.loading}</span>
    </div>
  );
}
