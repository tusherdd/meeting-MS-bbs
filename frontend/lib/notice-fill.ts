/**
 * v1.21 part 3 (SPEC.md §6.12, §13.6): "fill the meeting form from the notice" — pure mapping of
 * the POST /meetings/notice-extract response into what the meeting form needs. No React here, so
 * the rules are unit-tested (tests/unit/notice-fill.test.ts).
 */
import { isApiError } from "./api";
import type {
  NoticeExtractResult,
  NoticeMatchedOfficer,
  NoticeUnmatchedReason,
} from "./types";

/** A person as the participant chips need it (same shape as components/meetings/people.ts). */
export interface FillPerson {
  id: string;
  nameBn: string;
  nameEn: string;
  designation: { nameBn: string; nameEn: string } | null;
  wing: { id: string; nameBn: string; nameEn: string } | null;
  photoPath: string | null;
}

/** Form fields the notice may fill, in the form's own names (venue = `room`). */
export const FILL_FIELDS = ["title", "date", "startTime", "endTime", "room", "agenda"] as const;
export type FillField = (typeof FILL_FIELDS)[number];

export type ChairPlan =
  | { kind: "none" }
  | { kind: "sure"; person: FillPerson; text: string }
  | { kind: "maybe"; text: string; candidates: FillPerson[] }
  | {
      kind: "unmatched";
      text: string;
      name: string | null;
      designation: string | null;
      reason: NoticeUnmatchedReason | null;
    };

export interface MaybeLine {
  line: number;
  text: string;
  candidates: FillPerson[];
}

export interface UnmatchedLine {
  line: number;
  text: string;
  name: string | null;
  designation: string | null;
  reason: NoticeUnmatchedReason;
}

export interface FillPlan {
  method: NoticeExtractResult["method"];
  /** Only the values the notice really had (never null, never empty). */
  values: Partial<Record<FillField, string>>;
  filledFields: FillField[];
  /** "sure" participants to add: without the organizer, people already chosen and repeats. */
  addPeople: FillPerson[];
  chair: ChairPlan;
  maybe: MaybeLine[];
  unmatched: UnmatchedLine[];
  /** The counts of the summary box, as the backend sent them. */
  stats: { fields: number; total: number; sure: number; maybe: number; unmatched: number };
  warnings: NoticeExtractResult["warnings"];
  /** Nothing usable at all: no field, no chair, no distribution line. */
  empty: boolean;
}

export function officerToPerson(o: NoticeMatchedOfficer): FillPerson {
  return {
    id: o.id,
    nameBn: o.nameBn,
    nameEn: o.nameEn,
    designation: o.designation
      ? { nameBn: o.designation.nameBn, nameEn: o.designation.nameEn }
      : null,
    wing: o.wing ? { id: o.wing.id, nameBn: o.wing.nameBn, nameEn: o.wing.nameEn } : null,
    photoPath: null,
  };
}

const RESPONSE_FIELD: Record<FillField, keyof NoticeExtractResult["fields"]> = {
  title: "title",
  date: "date",
  startTime: "startTime",
  endTime: "endTime",
  room: "venue",
  agenda: "agenda",
};

/**
 * The fill plan for one response. `existingIds` = participants already in the form; at most
 * `maxPeople` participants in total (the picker's limit) — the sure chair is counted first.
 */
export function planFill(
  res: NoticeExtractResult,
  opts: { organizerId: string; existingIds: readonly string[]; maxPeople: number },
): FillPlan {
  const values: Partial<Record<FillField, string>> = {};
  for (const field of FILL_FIELDS) {
    const raw = res.fields[RESPONSE_FIELD[field]];
    if (typeof raw === "string" && raw.trim() !== "") values[field] = raw.trim();
  }
  const filledFields = FILL_FIELDS.filter((f) => values[f] !== undefined);

  const taken = new Set<string>([opts.organizerId, ...opts.existingIds]);
  const addPeople: FillPerson[] = [];
  const room = () => opts.existingIds.length + addPeople.length < opts.maxPeople;
  const add = (o: NoticeMatchedOfficer) => {
    if (taken.has(o.id) || !room()) return;
    taken.add(o.id);
    addPeople.push(officerToPerson(o));
  };

  let chair: ChairPlan = { kind: "none" };
  const c = res.chair;
  if (c?.status === "sure" && c.match) {
    // The chair select lists only the organizer and the participants, so the chair joins them.
    add(c.match.officer);
    chair = { kind: "sure", person: officerToPerson(c.match.officer), text: c.text };
  } else if (c?.status === "maybe" && c.candidates.length > 0) {
    chair = {
      kind: "maybe",
      text: c.text,
      candidates: c.candidates.map((m) => officerToPerson(m.officer)),
    };
  } else if (c) {
    chair = {
      kind: "unmatched",
      text: c.text,
      name: c.name,
      designation: c.designation,
      reason: c.reason,
    };
  }

  for (const s of res.participants.sure) add(s.match.officer);

  const { sure, maybe, unmatched } = res.participants;
  const total = sure.length + maybe.length + unmatched.length;
  return {
    method: res.method,
    values,
    filledFields,
    addPeople,
    chair,
    maybe: maybe.map((m) => ({
      line: m.line,
      text: m.text,
      candidates: m.candidates.slice(0, 3).map((x) => officerToPerson(x.officer)),
    })),
    unmatched: unmatched.map((u) => ({
      line: u.line,
      text: u.text,
      name: u.name,
      designation: u.designation,
      reason: u.reason,
    })),
    stats: {
      fields: filledFields.length,
      total,
      sure: sure.length,
      maybe: maybe.length,
      unmatched: unmatched.length,
    },
    warnings: res.warnings,
    empty: filledFields.length === 0 && !c && total === 0,
  };
}

/**
 * Does the form already hold something the fill would replace? The prefilled date / times of a
 * new meeting do not count (they are defaults, not the user's writing).
 */
export function formHasValues(
  values: { title: string; agenda: string; room: string; chairId: string },
  counts: { people: number; guests: number },
): boolean {
  return (
    values.title.trim() !== "" ||
    values.agenda.trim() !== "" ||
    values.room.trim() !== "" ||
    values.chairId !== "" ||
    counts.people > 0 ||
    counts.guests > 0
  );
}

/** Which message a failed extraction shows. */
export type FillErrorKind = "failed" | "rateLimited" | "unavailable" | "other";

export function fillErrorKind(err: unknown): FillErrorKind {
  if (!isApiError(err)) return "other";
  if (err.status === 429) return "rateLimited";
  if (err.status === 422) return "failed";
  // 404 = an older backend without the route, 403 = this account may not use it.
  if (err.status === 404 || err.status === 403) return "unavailable";
  return "other";
}

/** Guest-officer fields prefilled from a notice line (the email is still typed by the user). */
export function guestPrefill(line: {
  text: string;
  name: string | null;
  designation: string | null;
}): { name: string; designation: string } {
  return { name: (line.name ?? line.text).trim(), designation: (line.designation ?? "").trim() };
}
