"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { LoadingBlock } from "@/components/ui/spinner";
import { loginUrlFor } from "@/lib/safe-next";
import { t } from "@/messages";
import { useAuth } from "@/providers/auth-provider";

export const CHANGE_PASSWORD_PATH = "/change-password";

/**
 * Protects every (app) page:
 * - no session → /login?next=<this page>
 * - mustChangePassword → /change-password (the backend also refuses everything else until then)
 * Nothing of the page is rendered before the check has passed.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, isLoading, error, reload } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const mustChange = !!user?.mustChangePassword;
  const needsLogin = !isLoading && !error && user === null;
  const needsPasswordChange = mustChange && pathname !== CHANGE_PASSWORD_PATH;

  useEffect(() => {
    if (needsLogin) {
      router.replace(loginUrlFor(`${window.location.pathname}${window.location.search}`));
    } else if (needsPasswordChange) {
      router.replace(CHANGE_PASSWORD_PATH);
    }
  }, [needsLogin, needsPasswordChange, router]);

  if (error && !user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <ErrorAlert error={error} onRetry={() => void reload()} />
      </div>
    );
  }
  if (isLoading || needsLogin || needsPasswordChange) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock label={t.auth.checkingSession} />
      </div>
    );
  }
  return <>{children}</>;
}
