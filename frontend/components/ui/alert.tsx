import clsx from "clsx";
import type { ReactNode } from "react";
import { isApiError } from "@/lib/api";
import { t } from "@/messages";
import { Button } from "./button";

type Tone = "error" | "success" | "warning" | "info";

const tones: Record<Tone, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  success: "border-brand-200 bg-brand-50 text-brand-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={clsx(title && "mt-1")}>{children}</div>}
    </div>
  );
}

/** Backend error: its Bangla message plus the request id (for reporting the problem). */
export function ErrorAlert({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message = error instanceof Error ? error.message : t.errors.unknown;
  const requestId = isApiError(error) ? error.requestId : undefined;
  return (
    <Alert tone="error" className={className}>
      <p>{message}</p>
      {requestId && (
        <p className="mt-1 text-xs text-red-700/80">
          {t.common.requestId}: <span className="font-mono select-all">{requestId}</span>
        </p>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          {t.common.retry}
        </Button>
      )}
    </Alert>
  );
}
