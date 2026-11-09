"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/endpoints";
import { newPasswordSchema, type NewPasswordForm as Values } from "@/lib/schemas";
import { t } from "@/messages";
import { AuthCard } from "./auth-card";
import { PasswordInput } from "./password-input";
import { PasswordRules } from "./password-rules";

/**
 * /reset-password?token= and /set-password?token= share this form: both links go to
 * POST /auth/reset-password; the backend knows from the token which kind it is.
 */
export function NewPasswordForm({ mode }: { mode: "reset" | "set" }) {
  const token = useSearchParams().get("token")?.trim() ?? "";
  const form = useForm<Values>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });
  const password = useWatch({ control: form.control, name: "newPassword" });
  const save = useMutation({ mutationFn: authApi.resetPassword });
  const { errors } = form.formState;

  const title = mode === "set" ? t.auth.setTitle : t.auth.resetTitle;
  const subtitle = mode === "set" ? t.auth.setSubtitle : t.auth.resetSubtitle;

  if (!token) {
    return (
      <AuthCard title={title}>
        <div className="space-y-4">
          <Alert tone="error">{t.auth.missingToken}</Alert>
          <Link
            href="/forgot-password"
            className="block text-center text-sm font-medium text-brand-700 hover:underline"
          >
            {t.auth.requestNewLink}
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (save.isSuccess) {
    return (
      <AuthCard title={title}>
        <div className="space-y-4">
          <Alert tone="success">{save.data.message}</Alert>
          <Link
            href="/login"
            className="block text-center text-sm font-medium text-brand-700 hover:underline"
          >
            {t.common.backToLogin}
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={title} subtitle={subtitle}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit((values) =>
          save.mutate({ token, newPassword: values.newPassword }),
        )}
      >
        {save.isError && (
          <div className="space-y-2">
            <ErrorAlert error={save.error} />
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              {t.auth.requestNewLink}
            </Link>
          </div>
        )}
        <PasswordInput
          id="newPassword"
          label={t.auth.newPassword}
          autoComplete="new-password"
          required
          error={errors.newPassword?.message}
          {...form.register("newPassword")}
        />
        <PasswordRules password={password} />
        <PasswordInput
          id="confirmPassword"
          label={t.auth.confirmPassword}
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...form.register("confirmPassword")}
        />
        <Button
          type="submit"
          className="w-full"
          loading={save.isPending}
          loadingText={t.auth.saving}
        >
          {t.auth.savePassword}
        </Button>
      </form>
    </AuthCard>
  );
}
