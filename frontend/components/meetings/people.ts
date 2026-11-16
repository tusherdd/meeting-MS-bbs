import type { NameHelpers } from "@/lib/display-name";
import type { DirectoryEntry, Participant } from "@/lib/types";

/** A person chosen for a meeting, with what the chips need to show (both languages, v1.7). */
export interface SelectedPerson {
  id: string;
  nameBn: string;
  nameEn: string;
  designation: { nameBn: string; nameEn: string } | null;
  wing: { id: string; nameBn: string; nameEn: string } | null;
  photoPath: string | null;
}

export function fromDirectory(e: DirectoryEntry): SelectedPerson {
  return {
    id: e.id,
    nameBn: e.nameBn,
    nameEn: e.nameEn,
    designation: e.designation
      ? { nameBn: e.designation.nameBn, nameEn: e.designation.nameEn }
      : null,
    wing: e.wing ? { id: e.wing.id, nameBn: e.wing.nameBn, nameEn: e.wing.nameEn } : null,
    photoPath: e.photoPath,
  };
}

export function fromParticipant(p: Participant): SelectedPerson {
  return {
    id: p.id,
    nameBn: p.nameBn,
    nameEn: p.nameEn,
    designation: p.designation
      ? { nameBn: p.designation.nameBn, nameEn: p.designation.nameEn }
      : null,
    wing: p.wing ? { id: p.wing.id, nameBn: p.wing.nameBn, nameEn: p.wing.nameEn } : null,
    photoPath: null,
  };
}

/** Chips grouped by wing name in the UI language (people without a wing last). */
export function groupByWing(
  people: SelectedPerson[],
  noWingLabel: string,
  names: NameHelpers,
  locale: string,
): { wing: string; people: SelectedPerson[] }[] {
  const groups = new Map<string, SelectedPerson[]>();
  for (const p of people) {
    const key = names.maybe(p.wing) ?? "";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, locale)))
    .map(([wing, list]) => ({
      wing: wing || noWingLabel,
      people: list.sort((x, y) => names.of(x).localeCompare(names.of(y), locale)),
    }));
}
