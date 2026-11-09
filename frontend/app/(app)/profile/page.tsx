import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { t } from "@/messages";

export const metadata: Metadata = { title: t.placeholders.profile };

export default function Page() {
  return <ComingSoon title={t.placeholders.profile} />;
}
