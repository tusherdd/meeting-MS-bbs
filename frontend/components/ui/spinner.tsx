import clsx from "clsx";
import { t } from "@/messages";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={clsx(
          "inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent",
          className,
        )}
      />
      <span className="sr-only">{label ?? t.common.loading}</span>
    </span>
  );
}

/** Centered spinner with a visible text, for whole sections or pages. */
export function LoadingBlock({ label = t.common.loading }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-500">
      <span
        aria-hidden="true"
        className="inline-block size-5 animate-spin rounded-full border-2 border-brand-600 border-r-transparent"
      />
      <span role="status">{label}</span>
    </div>
  );
}
