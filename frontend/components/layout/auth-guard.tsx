"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { ErrorAlert } from "@/components/ui/alert";
import { LoadingBlock } from "@/components/ui/spinner";
import { loginUrlFor } from "@/lib/safe-next";
import { t } from "@/messages";
import { useAuth } from "@/providers/auth-provider";

export const CHANGE_PASSWORD_PATH = "/change-password";

/**
 * Protects every (app) page:
 * - no session → /login?next=<this page> (+ &reason=expired when the session ended while here)
 * - mustChangePassword → /change-password (the backend also refuses everything else until then)
 * Nothing of the page is rendered before the check has passed.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, isLoading, error, reload, isLoggingOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Had a session on this page before: losing it now means it expired (not a first visit).
  const hadUser = useRef(false);
  useEffect(() => {
    if (user) hadUser.current = true;
  }, [user]);

  const mustChange = !!user?.mustChangePassword;
  const needsLogin = !isLoading && !error && user === null;
  const needsPasswordChange = mustChange && pathname !== CHANGE_PASSWORD_PATH;

  useEffect(() => {
    if (needsLogin) {
      // "লগআউট" navigates to /login itself; do not add ?next= to it.
      if (isLoggingOut()) return;
      const here = `${window.location.pathname}${window.location.search}`;
      router.replace(loginUrlFor(here, hadUser.current ? "expired" : undefined));
    } else if (needsPasswordChange) {
      router.replace(CHANGE_PASSWORD_PATH);
    }
  }, [needsLogin, needsPasswordChange, router, isLoggingOut]);

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
