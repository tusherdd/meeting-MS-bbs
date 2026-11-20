"use client";

import { useFormState, type UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { type ProfileFormValues } from "@/lib/schemas";
import type { Profile, Wing } from "@/lib/types";
import { useT } from "@/providers/locale-provider";
import type { NameHelpers } from "@/lib/display-name";

/** Form defaults from a profile / user record ("" for empty values). */
export function profileDefaults(p: Profile): ProfileFormValues {
  return {
    nameBn: p.nameBn,
    nameEn: p.nameEn,
    designationRemark: p.designationRemark ?? "",
    wingId: p.wing?.id ?? "",
    mobile: p.mobile ?? "",
    mobileAlt: p.mobileAlt ?? "",
    officePhone: p.officePhone ?? "",
    fax: p.fax ?? "",
  };
}

/** Wing options: active wings, plus the current one even if it has been deactivated. */
export function wingOptions(
  wings: Wing[] | undefined,
  current: { id: string; nameBn: string; nameEn?: string } | null | undefined,
  names: NameHelpers,
) {
  const list = (wings ?? []).filter((w) => w.isActive || w.id === current?.id);
  if (current && !list.some((w) => w.id === current.id)) {
    list.push({
      ...current,
      nameEn: current.nameEn ?? "",
      isActive: false,
      userCount: 0,
      createdAt: "",
      updatedAt: "",
    });
  }
  return list.map((w) => ({ value: w.id, label: names.of(w) }));
}

/**
 * The fields an officer may edit on their own profile (PATCH /profile). The admin user form
 * shows the same fields plus login email, designation, organisation and (v1.16, admin only) the
 * structured additional charges.
 */
export function ProfileFields({
  form,
  idPrefix,
  wingOptions: wings,
}: {
  form: UseFormReturn<ProfileFormValues>;
  idPrefix: string;
  wingOptions: { value: string; label: string }[];
}) {
  const t = useT();
  const { register, control } = form;
  // Subscribe explicitly: this is a child of the form owner, so reading form.formState here
  // would not re-render it when errors change (the React Compiler memoizes on `form`).
  const { errors } = useFormState({ control });
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id={id("nameBn")}
          label={t.profile.nameBn}
          required
          error={errors.nameBn?.message}
          {...register("nameBn")}
        />
        <Input
          id={id("nameEn")}
          label={t.profile.nameEn}
          required
          error={errors.nameEn?.message}
          {...register("nameEn")}
        />
        <Input
          id={id("designationRemark")}
          label={t.profile.designationRemark}
          hint={t.profile.designationRemarkHint}
          error={errors.designationRemark?.message}
          {...register("designationRemark")}
        />
        <Select
          id={id("wingId")}
          label={t.profile.wing}
          placeholder={t.profile.noWing}
          options={wings}
          error={errors.wingId?.message}
          {...register("wingId")}
        />
        <Input
          id={id("mobile")}
          label={t.profile.mobile}
          inputMode="tel"
          autoComplete="tel"
          hint={t.profile.mobileHint}
          error={errors.mobile?.message}
          {...register("mobile")}
        />
        <Input
          id={id("mobileAlt")}
          label={t.profile.mobileAlt}
          inputMode="tel"
          hint={t.profile.mobileHint}
          error={errors.mobileAlt?.message}
          {...register("mobileAlt")}
        />
        <Input
          id={id("officePhone")}
          label={t.profile.officePhone}
          inputMode="tel"
          error={errors.officePhone?.message}
          {...register("officePhone")}
        />
        <Input
          id={id("fax")}
          label={t.profile.fax}
          inputMode="tel"
          error={errors.fax?.message}
          {...register("fax")}
        />
      </div>
    </div>
  );
}
