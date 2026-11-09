import type { DirectoryEntry, Participant } from "@/lib/types";

/** A person chosen for a meeting, with what the chips need to show. */
export interface SelectedPerson {
  id: string;
  nameBn: string;
  designationBn: string | null;
  wing: { id: string; nameBn: string } | null;
  photoPath: string | null;
}

export function fromDirectory(e: DirectoryEntry): SelectedPerson {
  return {
    id: e.id,
    nameBn: e.nameBn,
    designationBn: e.designation?.nameBn ?? null,
    wing: e.wing ? { id: e.wing.id, nameBn: e.wing.nameBn } : null,
    photoPath: e.photoPath,
  };
}

export function fromParticipant(p: Participant): SelectedPerson {
  return {
    id: p.id,
    nameBn: p.nameBn,
    designationBn: p.designation?.nameBn ?? null,
    wing: p.wing ? { id: p.wing.id, nameBn: p.wing.nameBn } : null,
    photoPath: null,
  };
}

/** Chips grouped by wing name (people without a wing last). */
export function groupByWing(
  people: SelectedPerson[],
  noWingLabel: string,
): { wing: string; people: SelectedPerson[] }[] {
  const groups = new Map<string, SelectedPerson[]>();
  for (const p of people) {
    const key = p.wing?.nameBn ?? "";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "bn")))
    .map(([wing, list]) => ({
      wing: wing || noWingLabel,
      people: list.sort((x, y) => x.nameBn.localeCompare(y.nameBn, "bn")),
    }));
}
