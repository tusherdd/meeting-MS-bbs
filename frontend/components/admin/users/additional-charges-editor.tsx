"use client";

import { useFieldArray, useFormState, type UseFormReturn } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MAX_ADDITIONAL_CHARGES, type UserFormValues } from "@/lib/schemas";
import { useFormat, useT } from "@/providers/locale-provider";

/**
 * v1.16 Admin → officer form: structured additional charges (SPEC.md §6.2) — designation
 * (required), wing (optional) and a note per row; add / remove rows. A migrated row that still
 * needs review shows the badge and its old text until the admin chooses a designation.
 */
export function AdditionalChargesEditor({
  form,
  designationOptions,
  wingOptions,
}: {
  form: UseFormReturn<UserFormValues>;
  designationOptions: { value: string; label: string }[];
  wingOptions: { value: string; label: string }[];
}) {
  const t = useT();
  const { formatNumber } = useFormat();
  const { control, register } = form;
  const { errors } = useFormState({ control });
  const rows = useFieldArray({ control, name: "additionalCharges" });

  return (
    <fieldset className="space-y-3" data-testid="charges-editor">
      <legend className="text-sm font-medium text-slate-800">{t.profile.charges}</legend>
      <p className="text-xs text-slate-600">{t.profile.chargesHint}</p>
      {rows.fields.length === 0 && <p className="text-sm text-slate-600">{t.profile.noCharges}</p>}
      <ul className="space-y-3">
        {rows.fields.map((field, index) => {
          const label = t.profile.chargeLabel(formatNumber(index + 1));
          const rowErrors = errors.additionalCharges?.[index];
          return (
            <li
              key={field.id}
              className="space-y-2 rounded-lg border border-slate-200 p-3"
              data-testid="charge-row"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{label}</span>
                {field.needsReview && <Badge tone="amber">{t.profile.chargeNeedsReview}</Badge>}
              </div>
              {field.needsReview && (
                <p className="text-xs text-slate-700">{t.profile.chargeReviewHint}</p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Select
                  id={`charge-${index}-designation`}
                  label={t.profile.chargeDesignation}
                  required
                  placeholder={t.admin.designationChoose}
                  options={designationOptions}
                  error={rowErrors?.designationId?.message}
                  {...register(`additionalCharges.${index}.designationId` as const)}
                />
                <Select
                  id={`charge-${index}-wing`}
                  label={t.profile.chargeWing}
                  placeholder={t.profile.chargeNoWing}
                  options={wingOptions}
                  {...register(`additionalCharges.${index}.wingId` as const)}
                />
                <Input
                  id={`charge-${index}-note`}
                  label={t.profile.chargeNote}
                  placeholder={t.profile.chargeNotePlaceholder}
                  error={rowErrors?.note?.message}
                  {...register(`additionalCharges.${index}.note` as const)}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => rows.remove(index)}
                aria-label={`${t.profile.removeCharge}: ${label}`}
              >
                {t.profile.removeCharge}
              </Button>
            </li>
          );
        })}
      </ul>
      {errors.additionalCharges?.message && (
        <p className="text-sm text-red-700">{errors.additionalCharges.message}</p>
      )}
      <Button
        variant="secondary"
        size="sm"
        disabled={rows.fields.length >= MAX_ADDITIONAL_CHARGES}
        onClick={() =>
          rows.append(
            { designationId: "", wingId: "", note: "", needsReview: false },
            { shouldFocus: true },
          )
        }
      >
        {t.profile.addCharge}
      </Button>
    </fieldset>
  );
}
