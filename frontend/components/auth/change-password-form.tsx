"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { authApi } from "@/lib/endpoints";
import { DEFAULT_AFTER_LOGIN } from "@/lib/safe-next";
import { changePasswordSchema, type ChangePasswordForm as Values } from "@/lib/schemas";
import { t } from "@/messages";
import { useAuth, useCurrentUser } from "@/providers/auth-provider";
import { PasswordInput } from "./password-input";
import { PasswordRules } from "./password-rules";

/** /change-password: forced after first login (mustChangePassword) and from the profile later. */
export function ChangePasswordForm() {
  const user = useCurrentUser();
  const { reload } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const schema = useMemo(() => changePasswordSchema(user.loginEmail), [user.loginEmail]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const password = useWatch({ control: form.control, name: "newPassword" });
  const { errors } = form.formState;

  const change = useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: async (res) => {
      // The backend set fresh cookies; reload /auth/me so mustChangePassword becomes false.
      toast.show(res.message || t.auth.changed);
      form.reset();
      await reload();
      router.replace(DEFAULT_AFTER_LOGIN);
    },
  });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">{t.auth.changeTitle}</h1>
      {user.mustChangePassword && <Alert tone="warning">{t.auth.changeForcedNotice}</Alert>}
      <Card>
        <CardBody>
          <form
            noValidate
            className="space-y-4"
            onSubmit={form.handleSubmit((v) =>
              change.mutate({ currentPassword: v.currentPassword, newPassword: v.newPassword }),
            )}
          >
            {change.isError && <ErrorAlert error={change.error} />}
            <PasswordInput
              id="currentPassword"
              label={t.auth.currentPassword}
              autoComplete="current-password"
              required
              error={errors.currentPassword?.message}
              {...form.register("currentPassword")}
            />
            <PasswordInput
              id="newPassword"
              label={t.auth.newPassword}
              autoComplete="new-password"
              required
              error={errors.newPassword?.message}
              {...form.register("newPassword")}
            />
            <PasswordRules password={password} email={user.loginEmail} />
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
              loading={change.isPending}
              loadingText={t.auth.saving}
            >
              {t.auth.changeButton}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
