"use client";

import { useFieldArray, useFormState, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatNumber } from "@/lib/format";
import { MAX_ADDITIONAL_CHARGES, type ProfileFormValues } from "@/lib/schemas";
import type { Profile, Wing } from "@/lib/types";
import { t } from "@/messages";

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
    additionalCharges: p.additionalCharges.map((c) => ({ value: c.description })),
  };
}

/** Wing options: active wings, plus the current one even if it has been deactivated. */
export function wingOptions(
  wings: Wing[] | undefined,
  current?: { id: string; nameBn: string } | null,
) {
  const list = (wings ?? []).filter((w) => w.isActive || w.id === current?.id);
  if (current && !list.some((w) => w.id === current.id)) {
    list.push({
      ...current,
      nameEn: "",
      isActive: false,
      userCount: 0,
      createdAt: "",
      updatedAt: "",
    });
  }
  return list.map((w) => ({ value: w.id, label: w.nameBn }));
}

/**
 * The fields an officer may edit on their own profile (PATCH /profile). The admin user form
 * shows the same fields plus login email, designation and organisation.
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
  const { register, control } = form;
  // Subscribe explicitly: this is a child of the form owner, so reading form.formState here
  // would not re-render it when errors change (the React Compiler memoizes on `form`).
  const { errors } = useFormState({ control });
  const charges = useFieldArray({ control, name: "additionalCharges" });
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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">{t.profile.charges}</legend>
        <p className="text-xs text-slate-600">{t.profile.chargesHint}</p>
        {charges.fields.length === 0 && (
          <p className="text-sm text-slate-500">{t.profile.noCharges}</p>
        )}
        <ul className="space-y-2" data-testid={id("charges")}>
          {charges.fields.map((field, index) => (
            <li key={field.id} className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  id={id(`charge-${index}`)}
                  label={t.profile.chargeLabel(formatNumber(index + 1))}
                  error={errors.additionalCharges?.[index]?.value?.message}
                  {...register(`additionalCharges.${index}.value` as const)}
                />
              </div>
              <Button
                variant="secondary"
                className="mb-0.5"
                onClick={() => charges.remove(index)}
                aria-label={`${t.profile.removeCharge}: ${t.profile.chargeLabel(formatNumber(index + 1))}`}
              >
                {t.profile.removeCharge}
              </Button>
            </li>
          ))}
        </ul>
        {errors.additionalCharges?.message && (
          <p className="text-sm text-red-700">{errors.additionalCharges.message}</p>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={charges.fields.length >= MAX_ADDITIONAL_CHARGES}
          onClick={() => charges.append({ value: "" }, { shouldFocus: true })}
        >
          {t.profile.addCharge}
        </Button>
      </fieldset>
    </div>
  );
}
