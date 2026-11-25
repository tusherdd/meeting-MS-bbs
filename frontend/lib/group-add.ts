/**
 * v1.20 group add (SPEC.md §13.6): which directory rows the "উইং / পদবি" box offers, and how a
 * row is labelled. The backend already leaves out inactive accounts and the SUPER_ADMIN and does
 * the wing / designation / additional-charge matching; here we drop the organizer, people who are
 * already participants and anyone who cannot be invited (no designation).
 */
import type { NameHelpers } from "./display-name";
import type { DirectoryEntry } from "./types";

export interface GroupFilter {
  wingId: string;
  designationId: string;
}

export const hasGroupFilter = (f: GroupFilter): boolean => !!f.wingId || !!f.designationId;

export function groupCandidates(
  entries: readonly DirectoryEntry[],
  organizerId: string,
  selectedIds: ReadonlySet<string>,
): DirectoryEntry[] {
  return entries.filter(
    (e) => e.id !== organizerId && !selectedIds.has(e.id) && e.designation !== null,
  );
}

/**
 * "name — designation, wing" in the UI language. An officer who matched only through an
 * additional charge shows that charge: "name — [পদবি] (অতিরিক্ত দায়িত্ব), [উইং]" (the charge's
 * wing, else the officer's own wing).
 */
export function groupLine(e: DirectoryEntry, names: NameHelpers, chargeSuffix: string): string {
  const charge = e.matchedCharge ?? null;
  const designation = charge
    ? `${names.of(charge.designation)} ${chargeSuffix}`
    : names.maybe(e.designation);
  const wing = names.maybe(charge?.wing ?? e.wing);
  const detail = [designation, wing].filter(Boolean).join(", ");
  return detail ? `${names.of(e)} — ${detail}` : names.of(e);
}

/** The ids that stay checked: everyone shown minus the ones the user unchecked. */
export function checkedIds(
  candidates: readonly DirectoryEntry[],
  unchecked: ReadonlySet<string>,
): string[] {
  return candidates.filter((e) => !unchecked.has(e.id)).map((e) => e.id);
}
