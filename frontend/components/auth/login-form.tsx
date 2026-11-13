"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi } from "@/lib/endpoints";
import { safeNextPath } from "@/lib/safe-next";
import { loginSchema, type LoginForm as LoginValues } from "@/lib/schemas";
import { t } from "@/messages";
import { useAuth } from "@/providers/auth-provider";
import { AuthCard } from "./auth-card";
import { PasswordInput } from "./password-input";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = safeNextPath(params.get("next"));
  const expired = params.get("reason") === "expired";
  const { user, setLoggedIn } = useAuth();

  // Already logged in (e.g. opened /login in a new tab) → go on.
  useEffect(() => {
    if (user) router.replace(user.mustChangePassword ? "/change-password" : nextPath);
  }, [user, nextPath, router]);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { loginEmail: "", password: "" },
  });

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (res) => {
      setLoggedIn(res);
      router.replace(res.mustChangePassword ? "/change-password" : nextPath);
    },
    onError: () => form.resetField("password"),
  });

  const { errors } = form.formState;

  return (
    <AuthCard title={t.auth.loginTitle} subtitle={t.auth.loginSubtitle}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
      >
        {expired && !login.isError && <Alert tone="warning">{t.errors.sessionExpired}</Alert>}
        {/* The backend's own text, unchanged (same message for every failed login). */}
        {login.isError && <ErrorAlert error={login.error} />}

        <Input
          id="loginEmail"
          label={t.auth.loginEmail}
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          error={errors.loginEmail?.message}
          {...form.register("loginEmail")}
        />
        <PasswordInput
          id="password"
          label={t.auth.password}
          autoComplete="current-password"
          required
          error={errors.password?.message}
          {...form.register("password")}
        />

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            {t.auth.forgotLink}
          </Link>
        </div>

        <Button
          type="submit"
          className="w-full"
          loading={login.isPending}
          loadingText={t.auth.loggingIn}
        >
          {t.auth.loginButton}
        </Button>
        {login.isPending && (
          <p className="text-center text-xs text-slate-500" aria-live="polite">
            {t.auth.loginSlowHint}
          </p>
        )}
      </form>
    </AuthCard>
  );
}
