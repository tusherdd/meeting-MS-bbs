"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { useT } from "@/providers/locale-provider";

/**
 * The ONE field label of the app (v1.17 part 3, SPEC.md §13.6a). A required field shows a red "*"
 * and the small muted word "আবশ্যক" / "Required" next to the label; other fields show nothing
 * extra. Both marks sit outside the <label> and are aria-hidden: the field's accessible name stays
 * exactly the label text, and screen readers hear "required" from the control (aria-required).
 * Callers derive `required` from the form's zod schema (lib/required-fields.ts).
 */
export function FieldLabel({
  htmlFor,
  required,
  className,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className={clsx("flex flex-wrap items-baseline gap-x-1", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-800">
        {children}
      </label>
      {required && (
        <span data-required-mark className="inline-flex items-baseline gap-x-1">
          <span aria-hidden="true" className="text-sm font-semibold text-red-700">
            *
          </span>
          <span aria-hidden="true" className="text-xs font-normal text-slate-600">
            {t.common.required}
          </span>
        </span>
      )}
    </div>
  );
}

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
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function controlClass(invalid: boolean, className?: string) {
  return clsx(
    "block w-full rounded-lg border bg-white px-3 text-[15px] text-slate-900 placeholder:text-(--color-placeholder)",
    "focus-visible:border-brand-700 disabled:bg-slate-100 disabled:text-slate-600",
    invalid ? "border-red-500" : "border-(--color-input-border) hover:border-slate-700",
    className,
  );
}

export function describedBy(id: string, error?: string, hint?: unknown) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
