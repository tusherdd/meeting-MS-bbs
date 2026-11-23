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
import {
  chargesWithoutDesignation,
  toUserPayload,
  type ProfileFormValues,
  type UserFormValues,
} from "@/lib/schemas";
import { AdditionalChargesEditor } from "./additional-charges-editor";
import { useSchemas } from "@/lib/hooks/use-schemas";
import { requiredFields } from "@/lib/required-fields";
import type { UserDetail } from "@/lib/types";
import type { Messages } from "@/messages";
import { useNames, useT } from "@/providers/locale-provider";

const EMPTY_PROFILE: ProfileFormValues = {
  nameBn: "",
  nameEn: "",
  designationRemark: "",
  wingId: "",
  mobile: "",
  mobileAlt: "",
  officePhone: "",
  fax: "",
};

function defaults(t: Messages, user?: UserDetail): UserFormValues {
  if (!user) {
    return {
      ...EMPTY_PROFILE,
      loginEmail: "",
      designationId: "",
      organizationBn: t.app.org,
      organizationEn: t.admin.defaultOrgEn,
      additionalCharges: [],
    };
  }
  return {
    ...profileDefaults(user),
    loginEmail: user.loginEmail,
    designationId: user.designation?.id ?? "",
    organizationBn: user.organizationBn ?? "",
    organizationEn: user.organizationEn ?? "",
    additionalCharges: user.additionalCharges.map((c) => ({
      designationId: c.designation?.id ?? "",
      wingId: c.wing?.id ?? "",
      note: c.note ?? "",
      needsReview: c.needsReview,
    })),
  };
}

/**
 * "নতুন কর্মকর্তা" (POST /users) and "কর্মকর্তা সম্পাদনা" (PATCH /users/:id).
 * New accounts get the office default password on the server; the password is never shown,
 * typed or sent from here (owner decision 2026-11-09, SPEC.md §6.2).
 */
export function UserForm({ user }: { user?: UserDetail }) {
  const { userFormSchema } = useSchemas();
  const req = requiredFields(userFormSchema);
  const t = useT();
  const names = useNames();
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
    defaultValues: defaults(t, user),
  });
  const { errors, dirtyFields } = useFormState({ control: form.control });

  const save = useMutation({
    mutationFn: (values: UserFormValues) => {
      // v1.16: the charge list is sent (and replaces the stored one) only when it was changed.
      const payload = toUserPayload(values, !user || !!dirtyFields.additionalCharges);
      return user ? usersApi.update(user.id, payload) : usersApi.create(payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      if (user) {
        queryClient.setQueryData(queryKeys.user(saved.id), saved);
        form.reset(defaults(t, saved));
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
      label: names.of(d),
    }));

  // v1.16 charges: active designations / wings, plus those the officer's charges already use.
  const usedDesignations = new Set(user?.additionalCharges.map((c) => c.designation?.id));
  const chargeDesignationChoices = (designations.data ?? [])
    .filter((d) => d.isActive || usedDesignations.has(d.id))
    .map((d) => ({ value: d.id, label: names.of(d) }));
  const usedWings = new Set(user?.additionalCharges.map((c) => c.wing?.id));
  const chargeWingChoices = (wings.data ?? [])
    .filter((w) => w.isActive || usedWings.has(w.id))
    .map((w) => ({ value: w.id, label: names.of(w) }));

  return (
    <Card>
      <CardHeader title={editing ? t.admin.editTitle : t.admin.createTitle} />
      <CardBody>
        <form
          noValidate
          className="space-y-4"
          onSubmit={form.handleSubmit((v) => {
            // A changed list replaces every row: rows that needed review need a designation now.
            if (!user || dirtyFields.additionalCharges) {
              const missing = chargesWithoutDesignation(v);
              if (missing.length > 0) {
                for (const i of missing) {
                  form.setError(`additionalCharges.${i}.designationId`, {
                    message: t.validation.chargeDesignationRequired,
                  });
                }
                return;
              }
            }
            save.mutate(v);
          })}
        >
          {!editing && <Alert tone="info">{t.admin.createNote}</Alert>}
          {save.isError && <ErrorAlert error={save.error} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="user-loginEmail"
              type="email"
              autoComplete="off"
              label={t.admin.loginEmail}
              required={req.loginEmail}
              hint={editing ? t.admin.loginEmailEditHint : t.admin.loginEmailHint}
              error={errors.loginEmail?.message}
              {...form.register("loginEmail")}
            />
            <Select
              id="user-designationId"
              label={t.admin.designation}
              required={req.designationId}
              placeholder={t.admin.designationChoose}
              options={designationChoices}
              hint={editing ? t.admin.designationEditNote : undefined}
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
            wingOptions={wingOptions(wings.data, user?.wing, names)}
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

          <AdditionalChargesEditor
            form={form}
            designationOptions={chargeDesignationChoices}
            wingOptions={chargeWingChoices}
          />

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
