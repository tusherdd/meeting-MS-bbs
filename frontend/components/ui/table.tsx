import clsx from "clsx";
import type { ComponentProps } from "react";

/** Plain, readable table. Wrap wide tables: it scrolls horizontally inside its own box. */
export function Table({ className, ...rest }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx("w-full border-collapse text-left text-sm", className)} {...rest} />
    </div>
  );
}

export function THead(props: ComponentProps<"thead">) {
  return <thead className="bg-slate-50 text-xs font-semibold text-slate-600" {...props} />;
}

export function TBody(props: ComponentProps<"tbody">) {
  return <tbody className="divide-y divide-slate-100" {...props} />;
}

export function Tr({ className, ...rest }: ComponentProps<"tr">) {
  return <tr className={clsx("align-top", className)} {...rest} />;
}

export function Th({ className, ...rest }: ComponentProps<"th">) {
  return <th scope="col" className={clsx("px-4 py-2.5 font-semibold", className)} {...rest} />;
}

export function Td({ className, ...rest }: ComponentProps<"td">) {
  return <td className={clsx("px-4 py-3 text-slate-800", className)} {...rest} />;
}
