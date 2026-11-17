import type { Locale } from "@/lib/i18n";

/**
 * An English value must be Latin text: at least one Latin letter, no Bangla character
 * (same rule as backend/src/common/validators/english-name.ts).
 */
export const ENGLISH_NAME_PATTERN = /^[^\u0980-\u09FF]*[A-Za-z][^\u0980-\u09FF]*$/;

/**
 * Display rule for officer, designation and wing names (v1.7, SPEC.md §13.15):
 * - English UI → the English value when it has text, otherwise the Bangla one;
 * - Bangla UI  → the Bangla value.
 * Guest officers and meeting titles are never passed through here: they stay as typed.
 */
export function pickName(locale: Locale, bn: string, en?: string | null): string {
  if (locale === "en") {
    const english = en?.trim();
    if (english) return english;
  }
  return bn;
}

/** Same rule for a value that may be missing (no designation / no wing). */
export function pickOptionalName(
  locale: Locale,
  bn: string | null | undefined,
  en?: string | null,
): string | null {
  if (bn == null || bn === "") {
    // A Bangla value is always stored; an English-only value never happens, but stay safe.
    return locale === "en" && en?.trim() ? en.trim() : null;
  }
  return pickName(locale, bn, en);
}

/** Anything with a Bangla and (usually) an English name: users, designations, wings. */
export interface Named {
  nameBn: string;
  nameEn?: string | null;
}

/**
 * How the organizer of a meeting is DISPLAYED on user pages (v1.9, SPEC.md §13.17): the
 * organizer's current wing in the UI language, or their designation when they have no wing.
 * Admin pages and audit logs keep the person (they do not use this).
 */
export function organizerLabel(
  locale: Locale,
  wing: { bn: string | null | undefined; en?: string | null },
  designation: { bn: string | null | undefined; en?: string | null },
): string {
  return (
    pickOptionalName(locale, wing.bn, wing.en) ??
    pickOptionalName(locale, designation.bn, designation.en) ??
    "—"
  );
}

/** The functions components use; built once per locale by `useNames()`. */
export interface NameHelpers {
  /** `{ nameBn, nameEn }` → display name. */
  of: (v: Named) => string;
  /** Same for an optional value (null / undefined → null). */
  maybe: (v: Named | null | undefined) => string | null;
  /** Separate fields, e.g. organizerNameBn / organizerNameEn. */
  pick: (bn: string, en?: string | null) => string;
  pickOptional: (bn: string | null | undefined, en?: string | null) => string | null;
  /** Organizer as displayed (v1.9): `{ wing, designation }` objects → wing, else designation. */
  organizer: (o: { wing?: Named | null; designation?: Named | null }) => string;
  /** Same from separate fields (conflict and report rows). */
  organizerFrom: (
    wingBn: string | null | undefined,
    wingEn: string | null | undefined,
    designationBn: string | null | undefined,
    designationEn: string | null | undefined,
  ) => string;
}

export function nameHelpers(locale: Locale): NameHelpers {
  return {
    of: (v) => pickName(locale, v.nameBn, v.nameEn),
    maybe: (v) => (v ? pickName(locale, v.nameBn, v.nameEn) : null),
    pick: (bn, en) => pickName(locale, bn, en),
    pickOptional: (bn, en) => pickOptionalName(locale, bn, en),
    organizer: (o) =>
      organizerLabel(
        locale,
        { bn: o.wing?.nameBn, en: o.wing?.nameEn },
        { bn: o.designation?.nameBn, en: o.designation?.nameEn },
      ),
    organizerFrom: (wingBn, wingEn, designationBn, designationEn) =>
      organizerLabel(locale, { bn: wingBn, en: wingEn }, { bn: designationBn, en: designationEn }),
  };
}

/**
 * Search helper for client-side filtering (pickers): matches the Bangla or the English name,
 * case-insensitive, whatever the UI language is.
 */
export function matchesName(v: Named, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return v.nameBn.toLowerCase().includes(q) || (v.nameEn ?? "").toLowerCase().includes(q);
}
