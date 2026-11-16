"use client";

import { useMemo } from "react";
import { createSchemas } from "@/lib/schemas";
import { useT } from "@/providers/locale-provider";

/** Form schemas whose error texts are in the current UI language. */
export function useSchemas() {
  const t = useT();
  return useMemo(() => createSchemas(t), [t]);
}
