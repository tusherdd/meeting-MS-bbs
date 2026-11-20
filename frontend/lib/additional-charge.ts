/**
 * v1.16 (SPEC.md §6.2): how an additional charge is shown everywhere —
 * "[পদবি] (অতিরিক্ত দায়িত্ব), [উইং]" plus " — [note]" when there is a note, names in the UI language
 * (§13.15 display rule). A row that still needs review has no designation: its wing (if any) and
 * its note (the old text) are shown.
 */
import type { NameHelpers } from "./display-name";

interface Named {
  nameBn: string;
  nameEn?: string | null;
}

export interface ChargeView {
  designation: Named | null;
  wing: Named | null;
  note: string | null;
  needsReview: boolean;
}

export function chargeText(c: ChargeView, names: NameHelpers, suffix: string): string {
  const wing = c.wing ? names.pick(c.wing.nameBn, c.wing.nameEn) : null;
  const head = c.designation
    ? [`${names.pick(c.designation.nameBn, c.designation.nameEn)} ${suffix}`, wing]
        .filter(Boolean)
        .join(", ")
    : wing;
  return [head, c.note?.trim() || null].filter(Boolean).join(" — ");
}
