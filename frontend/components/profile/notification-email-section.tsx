"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { profileApi, queryKeys } from "@/lib/endpoints";
import { emailFormSchema, type EmailFormValues } from "@/lib/schemas";
import type { Profile } from "@/lib/types";
import { t } from "@/messages";

/** Notification email: current address, pending address, request a change (verification mail). */
export function NotificationEmailSection({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: { email: "" },
  });

  const request = useMutation({
    mutationFn: (v: EmailFormValues) => profileApi.requestNotificationEmail(v.email.trim()),
    onSuccess: async (res) => {
      toast.show(res.message);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });

  return (
    <Card>
      <CardHeader title={t.profile.emailTitle} />
      <CardBody className="space-y-4">
        <dl className="text-sm">
          <dt className="text-slate-600">{t.profile.emailCurrent}</dt>
          <dd className="font-medium text-slate-900" data-testid="notification-email">
            {profile.notificationEmail}
          </dd>
        </dl>
        {profile.pendingNotificationEmail && (
          <Alert tone="warning" title={t.profile.emailPending(profile.pendingNotificationEmail)}>
            {t.profile.emailPendingHint}
          </Alert>
        )}
        <form
          noValidate
          className="flex flex-wrap items-end gap-3"
          onSubmit={form.handleSubmit((v) => request.mutate(v))}
        >
          <div className="min-w-64 flex-1">
            <Input
              id="notification-email-new"
              type="email"
              autoComplete="email"
              label={t.profile.emailNew}
              hint={t.profile.emailHint}
              error={form.formState.errors.email?.message}
              {...form.register("email")}
            />
          </div>
          <Button type="submit" loading={request.isPending} loadingText={t.profile.emailSending}>
            {t.profile.emailRequest}
          </Button>
        </form>
        {request.isError && <ErrorAlert error={request.error} />}
      </CardBody>
    </Card>
  );
}
