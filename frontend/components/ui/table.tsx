import clsx from "clsx";
import type { ComponentProps } from "react";

/**
 * Plain, readable table. It scrolls horizontally inside its own box (never the whole page).
 * v1.8: wide tables keep a readable minimum width on phones instead of squeezing every column;
 * `narrow` for small two- or three-column tables that fit a phone.
 */
export function Table({
  className,
  narrow = false,
  ...rest
}: ComponentProps<"table"> & { narrow?: boolean }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table
        className={clsx(
          "w-full border-collapse text-left text-sm",
          !narrow && "min-w-[56rem]",
          className,
        )}
        {...rest}
      />
    </div>
  );
}

export function THead(props: ComponentProps<"thead">) {
  return (
    <thead
      className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700"
      {...props}
    />
  );
}

export function TBody(props: ComponentProps<"tbody">) {
  return <tbody className="divide-y divide-slate-200" {...props} />;
}

export function Tr({ className, ...rest }: ComponentProps<"tr">) {
  return (
    <tr className={clsx("align-top transition-colors hover:bg-slate-50", className)} {...rest} />
  );
}

export function Th({ className, ...rest }: ComponentProps<"th">) {
  return <th scope="col" className={clsx("px-4 py-3 font-semibold", className)} {...rest} />;
}

export function Td({ className, ...rest }: ComponentProps<"td">) {
  return <td className={clsx("px-4 py-3 break-words text-slate-800", className)} {...rest} />;
}
