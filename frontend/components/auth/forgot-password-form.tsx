"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi } from "@/lib/endpoints";
import { forgotPasswordSchema, type ForgotPasswordForm as Values } from "@/lib/schemas";
import { t } from "@/messages";
import { AuthCard } from "./auth-card";

export function ForgotPasswordForm() {
  const form = useForm<Values>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { loginEmail: "" },
  });
  const send = useMutation({ mutationFn: authApi.forgotPassword });

  return (
    <AuthCard title={t.auth.forgotTitle} subtitle={t.auth.forgotSubtitle}>
      {send.isSuccess ? (
        // Always the same text: it never reveals whether the email has an account.
        <div className="space-y-4">
          <Alert tone="success">{t.auth.forgotSent}</Alert>
          <Link
            href="/login"
            className="block text-center text-sm font-medium text-brand-700 hover:underline"
          >
            {t.common.backToLogin}
          </Link>
        </div>
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => send.mutate(values))}
        >
          {send.isError && <ErrorAlert error={send.error} />}
          <Input
            id="loginEmail"
            label={t.auth.loginEmail}
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            error={form.formState.errors.loginEmail?.message}
            {...form.register("loginEmail")}
          />
          <Button
            type="submit"
            className="w-full"
            loading={send.isPending}
            loadingText={t.auth.forgotSending}
          >
            {t.auth.forgotButton}
          </Button>
          <Link
            href="/login"
            className="block text-center text-sm font-medium text-brand-700 hover:underline"
          >
            {t.common.backToLogin}
          </Link>
        </form>
      )}
    </AuthCard>
  );
}
