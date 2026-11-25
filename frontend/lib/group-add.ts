/**
 * Participant picker filters (v1.20 rework, SPEC.md §13.6): name search + "উইং" + "পদবি" in one row,
 * and the "এই তালিকার সবাইকে যোগ করুন (N জন)" button for the current wing + designation filters.
 * The backend already leaves out inactive accounts and the SUPER_ADMIN and does the wing /
 * designation / additional-charge matching; here we drop the organizer, people who are already
 * participants and anyone who cannot be invited (no designation).
 */
import type { NameHelpers } from "./display-name";
import type { DirectoryEntry } from "./types";

export interface GroupFilter {
  wingId: string;
  designationId: string;
}

/** The add-all button is shown once a wing or a designation is selected. */
export const hasGroupFilter = (f: GroupFilter): boolean => !!f.wingId || !!f.designationId;

/** Who the add-all button would add (its N). */
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
 * The second line of a result row: "designation · wing". An officer who matched the designation
 * filter only through an additional charge shows that charge instead:
 * "[পদবি] (অতিরিক্ত দায়িত্ব) · [উইং]" (the charge's wing, else the officer's own wing).
 */
export function directoryDetail(
  e: DirectoryEntry,
  names: NameHelpers,
  chargeSuffix: string,
): string {
  const charge = e.matchedCharge ?? null;
  const designation = charge
    ? `${names.of(charge.designation)} ${chargeSuffix}`
    : names.maybe(e.designation);
  const wing = names.maybe(charge?.wing ?? e.wing);
  return [designation, wing].filter(Boolean).join(" · ");
}

/** The group named in the confirmation: "designation, wing", or just one of them. */
export function groupLabel(
  designation: string | null | undefined,
  wing: string | null | undefined,
): string {
  return [designation, wing].filter(Boolean).join(", ");
}
