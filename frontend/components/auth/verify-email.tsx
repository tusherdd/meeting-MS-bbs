"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { LoadingBlock } from "@/components/ui/spinner";
import { authApi, queryKeys } from "@/lib/endpoints";
import { t } from "@/messages";
import { AuthCard } from "./auth-card";

/**
 * Calls GET /profile/notification-email/verify?token= once. The link is single-use, so the
 * result is cached for good and never refetched (no retry, no refetch on focus).
 */
export function VerifyEmail() {
  const token = useSearchParams().get("token")?.trim() ?? "";
  const verify = useQuery({
    queryKey: queryKeys.verifyEmail(token),
    queryFn: () => authApi.verifyNotificationEmail(token),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return (
    <AuthCard title={t.auth.verifyTitle}>
      <div className="space-y-4">
        {!token ? (
          <Alert tone="error">{t.auth.missingToken}</Alert>
        ) : verify.isPending ? (
          <LoadingBlock label={t.auth.verifying} />
        ) : verify.isError ? (
          <ErrorAlert error={verify.error} />
        ) : (
          <Alert tone="success">{verify.data.message}</Alert>
        )}
        <Link
          href="/dashboard"
          className="block text-center text-sm font-medium text-brand-700 hover:underline"
        >
          {t.common.goToDashboard}
        </Link>
      </div>
    </AuthCard>
  );
}
