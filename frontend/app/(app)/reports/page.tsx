import type { Metadata } from "next";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.placeholders.reports };

/** Built in F3. Until then the page stays empty (owner decision 2026-11-09). */
export default function Page() {
  return null;
}
