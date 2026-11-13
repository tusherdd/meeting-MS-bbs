import clsx from "clsx";
import type { ReactNode } from "react";
import { t } from "@/messages";

/** Label + control + hint/error, with the ids wired for screen readers. */
export function Field({
  id,
  label,
  error,
  hint,
  required,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-1">
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        {required && (
          // Outside the <label>: the field's name stays exactly the label text. Screen readers
          // already hear "required" from the field itself.
          <span aria-hidden="true" className="text-xs font-normal text-slate-600">
            {t.common.required}
          </span>
        )}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function controlClass(invalid: boolean, className?: string) {
  return clsx(
    "block w-full rounded-lg border bg-white px-3 text-[15px] text-slate-900 placeholder:text-slate-400",
    "disabled:bg-slate-100 disabled:text-slate-500",
    invalid ? "border-red-500" : "border-slate-300 hover:border-slate-400",
    className,
  );
}

export function describedBy(id: string, error?: string, hint?: unknown) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
