"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm, useFormState, type UseFormReturn } from "react-hook-form";
import { ProfileFields, profileDefaults, wingOptions } from "@/components/profile/profile-fields";
import { Alert, ErrorAlert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { designationsApi, queryKeys, usersApi, wingsApi } from "@/lib/endpoints";
import { formatNumber } from "@/lib/format";
import {
  toUserPayload,
  userFormSchema,
  type ProfileFormValues,
  type UserFormValues,
} from "@/lib/schemas";
import type { UserDetail } from "@/lib/types";
import { t } from "@/messages";

const EMPTY_PROFILE: ProfileFormValues = {
  nameBn: "",
  nameEn: "",
  designationRemark: "",
  wingId: "",
  mobile: "",
  mobileAlt: "",
  officePhone: "",
  fax: "",
  additionalCharges: [],
};

function defaults(user?: UserDetail): UserFormValues {
  if (!user) {
    return {
      ...EMPTY_PROFILE,
      loginEmail: "",
      designationId: "",
      organizationBn: t.app.org,
      organizationEn: t.admin.defaultOrgEn,
    };
  }
  return {
    ...profileDefaults(user),
    loginEmail: user.loginEmail,
    designationId: user.designation?.id ?? "",
    organizationBn: user.organizationBn ?? "",
    organizationEn: user.organizationEn ?? "",
  };
}

/**
 * "নতুন কর্মকর্তা" (POST /users) and "ব্যবহারকারী সম্পাদনা" (PATCH /users/:id).
 * New accounts get the office default password on the server; the password is never shown,
 * typed or sent from here (owner decision 2026-11-09, SPEC.md §6.2).
 */
export function UserForm({ user }: { user?: UserDetail }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const editing = !!user;

  const wings = useQuery({ queryKey: queryKeys.allWings, queryFn: wingsApi.list });
  const designations = useQuery({
    queryKey: queryKeys.designations(false),
    queryFn: () => designationsApi.list(false),
  });

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: defaults(user),
  });
  const { errors, dirtyFields } = useFormState({ control: form.control });

  const save = useMutation({
    mutationFn: (values: UserFormValues) => {
      const payload = toUserPayload(values);
      return user ? usersApi.update(user.id, payload) : usersApi.create(payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      if (user) {
        queryClient.setQueryData(queryKeys.user(saved.id), saved);
        form.reset(defaults(saved));
        toast.show(t.admin.saved);
      } else {
        toast.show(t.admin.created);
        router.push(`/admin/users/${saved.id}?created=1`);
      }
    },
  });

  // Active designations, plus the user's current one even if it was deactivated.
  const designationChoices = (designations.data ?? [])
    .filter((d) => d.isActive || d.id === user?.designation?.id)
    .map((d) => ({
      value: d.id,
      label: t.profile.designationOption(d.nameBn, formatNumber(d.priority)),
    }));

  return (
    <Card>
      <CardHeader title={editing ? t.admin.editTitle : t.admin.createTitle} />
      <CardBody>
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
          {!editing && <Alert tone="info">{t.admin.createNote}</Alert>}
          {save.isError && <ErrorAlert error={save.error} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="user-loginEmail"
              type="email"
              autoComplete="off"
              label={t.admin.loginEmail}
              required
              hint={editing ? t.admin.loginEmailEditHint : t.admin.loginEmailHint}
              error={errors.loginEmail?.message}
              {...form.register("loginEmail")}
            />
            <Select
              id="user-designationId"
              label={t.admin.designation}
              required
              placeholder={t.admin.designationChoose}
              options={designationChoices}
              hint={editing ? t.admin.designationEditNote : t.admin.priorityExplain}
              error={errors.designationId?.message}
              {...form.register("designationId")}
            />
          </div>
          {editing && dirtyFields.designationId && (
            <Alert tone="warning">{t.admin.designationEditNote}</Alert>
          )}

          <ProfileFields
            // The user form has every profile field (plus more); the shared fields only use those.
            form={form as unknown as UseFormReturn<ProfileFormValues>}
            idPrefix="user"
            wingOptions={wingOptions(wings.data, user?.wing)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="user-organizationBn"
              label={t.admin.organizationBn}
              error={errors.organizationBn?.message}
              {...form.register("organizationBn")}
            />
            <Input
              id="user-organizationEn"
              label={t.admin.organizationEn}
              error={errors.organizationEn?.message}
              {...form.register("organizationEn")}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={save.isPending} loadingText={t.profile.saving}>
              {editing ? t.admin.saveChanges : t.admin.createButton}
            </Button>
            <LinkButton href="/admin/users" variant="secondary">
              {t.admin.backToUsers}
            </LinkButton>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
