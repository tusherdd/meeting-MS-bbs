"use client";

import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { t } from "@/messages";
import { useAuth } from "@/providers/auth-provider";

/** Hides admin pages from officers. The backend checks the role again on every request. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Alert tone="error">{t.errors.forbidden}</Alert>;
  return <>{children}</>;
}
