import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

/**
 * v1.8 (SPEC.md §13.16): one style per kind — primary (filled green), secondary (outlined),
 * danger (filled red), ghost (text only, for close / menu buttons). At least 44 px tall on phones.
 */
const base =
  "inline-flex items-center justify-center gap-2 rounded-lg border text-center font-medium leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const variants: Record<Variant, string> = {
  primary: "border-brand-700 bg-brand-700 text-white hover:border-brand-800 hover:bg-brand-800",
  secondary:
    "border-(--color-input-border) bg-white text-brand-800 hover:border-brand-700 hover:bg-brand-50",
  ghost: "border-transparent text-slate-700 hover:bg-slate-100",
  danger: "border-red-600 bg-red-600 text-white hover:border-red-700 hover:bg-red-700",
};
const sizes: Record<Size, string> = {
  sm: "min-h-11 px-3 py-1 text-sm sm:min-h-9",
  md: "min-h-11 px-4 py-1.5 text-[15px] sm:min-h-10",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return clsx(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
  /** Disables the button and (optionally) swaps the text, e.g. "Saving…". */
  loading?: boolean;
  loadingText?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
