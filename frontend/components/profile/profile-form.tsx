"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { ErrorAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { peopleApi, profileApi, queryKeys } from "@/lib/endpoints";
import { profileFormSchema, toProfilePayload, type ProfileFormValues } from "@/lib/schemas";
import type { Profile } from "@/lib/types";
import { t } from "@/messages";
import { useAuth } from "@/providers/auth-provider";
import { ProfileFields, profileDefaults, wingOptions } from "./profile-fields";

/** Edit my own profile: only the fields PATCH /profile accepts. */
export function ProfileForm({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { reload } = useAuth();
  const wings = useQuery({ queryKey: queryKeys.wings, queryFn: peopleApi.wings });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: profileDefaults(profile),
  });

  const save = useMutation({
    mutationFn: (values: ProfileFormValues) => profileApi.update(toProfilePayload(values)),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.profile, updated);
      form.reset(profileDefaults(updated));
      toast.show(t.profile.saved);
      await reload(); // name / wing in the header
    },
  });

  return (
    <Card>
      <CardHeader title={t.profile.infoTitle} />
      <CardBody>
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          <p className="text-sm text-slate-600">{t.profile.infoHint}</p>
          {save.isError && <ErrorAlert error={save.error} />}
          <ProfileFields
            form={form}
            idPrefix="profile"
            wingOptions={wingOptions(wings.data, profile.wing)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={save.isPending} loadingText={t.profile.saving}>
              {t.profile.save}
            </Button>
            <Button
              variant="secondary"
              disabled={!form.formState.isDirty || save.isPending}
              onClick={() => form.reset(profileDefaults(profile))}
            >
              {t.profile.reset}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
