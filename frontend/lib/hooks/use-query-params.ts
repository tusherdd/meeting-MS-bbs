"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type Value = string | number | boolean | undefined | null;

/**
 * List filters kept in the address (?q=&page=…), so reload, back and shared links keep them.
 * `set()` drops empty values and goes back to page 1 unless the page itself changes.
 */
export function useQueryParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const get = useCallback((key: string) => params.get(key) ?? "", [params]);
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  const set = useCallback(
    (changes: Record<string, Value>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === null || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      if (!("page" in changes)) next.delete("page");
      if (next.get("page") === "1") next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return { get, page, set };
}

/** "true" / "false" / "" → true / false / undefined. */
export function parseBool(value: string): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}
