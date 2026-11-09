import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

export function Card({ className, ...rest }: ComponentProps<"section">) {
  return (
    <section
      className={clsx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  actions,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5",
        className,
      )}
    >
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {actions}
    </div>
  );
}

export function CardBody({ className, ...rest }: ComponentProps<"div">) {
  return <div className={clsx("px-4 py-4 sm:px-5", className)} {...rest} />;
}
