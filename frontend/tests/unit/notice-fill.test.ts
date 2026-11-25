import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  fillErrorKind,
  formHasValues,
  guestPrefill,
  officerToPerson,
  planFill,
} from "@/lib/notice-fill";
import type { NoticeExtractResult, NoticeMatchedOfficer } from "@/lib/types";

/** v1.21 part 3 (SPEC.md §6.12, §13.6): the notice-extract response → form state. */

const officer = (id: string, nameBn = `officer ${id}`): NoticeMatchedOfficer => ({
  id,
  nameBn,
  nameEn: `Officer ${id}`,
  designation: { id: "d1", nameBn: "পরিচালক", nameEn: "Director" },
  wing: { id: "w1", nameBn: "আইসিটি উইং", nameEn: "ICT Wing" },
});
const match = (o: NoticeMatchedOfficer) => ({
  officer: o,
  score: 0.95,
  designationMatch: true,
  wingMatch: false,
});
const line = (n: number, text: string) => ({
  line: n,
  text,
  name: null,
  designation: null,
  wing: null,
});

function response(over: Partial<NoticeExtractResult> = {}): NoticeExtractResult {
  return {
    method: "OCR",
    fields: {
      title: "ICT সভা",
      date: "2026-12-01",
      startTime: "11:00",
      endTime: "11:45",
      venue: "সম্মেলন কক্ষ",
      agenda: null,
    },
    chair: null,
    participants: { sure: [], maybe: [], unmatched: [] },
    warnings: [],
    ...over,
  };
}

const opts = { organizerId: "org", existingIds: [] as string[], maxPeople: 200 };

describe("planFill", () => {
  it("takes only non-null, non-empty fields and maps venue to room", () => {
    const plan = planFill(
      response({
        fields: {
          title: "  ICT সভা  ",
          date: "2026-12-01",
          startTime: null,
          endTime: null,
          venue: "কক্ষ ৫০১",
          agenda: "   ",
        },
      }),
      opts,
    );
    expect(plan.values).toEqual({ title: "ICT সভা", date: "2026-12-01", room: "কক্ষ ৫০১" });
    expect(plan.filledFields).toEqual(["title", "date", "room"]);
    expect(plan.stats.fields).toBe(3);
    expect(plan.empty).toBe(false);
  });

  it("adds sure participants once, never the organizer or people already chosen", () => {
    const a = officer("a");
    const b = officer("b");
    const plan = planFill(
      response({
        participants: {
          sure: [
            { ...line(1, "a"), match: match(a) },
            { ...line(2, "org"), match: match(officer("org")) },
            { ...line(3, "b"), match: match(b) },
            { ...line(4, "a again"), match: match(a) },
          ],
          maybe: [],
          unmatched: [],
        },
      }),
      { ...opts, existingIds: ["b"] },
    );
    expect(plan.addPeople.map((p) => p.id)).toEqual(["a"]);
    expect(plan.stats).toMatchObject({ total: 4, sure: 4, maybe: 0, unmatched: 0 });
  });

  it("stops at the participant limit", () => {
    const plan = planFill(
      response({
        participants: {
          sure: ["a", "b", "c"].map((id, i) => ({ ...line(i + 1, id), match: match(officer(id)) })),
          maybe: [],
          unmatched: [],
        },
      }),
      { ...opts, existingIds: ["x"], maxPeople: 3 },
    );
    expect(plan.addPeople.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("a sure chair joins the participants first", () => {
    const chair = officer("c");
    const plan = planFill(
      response({
        chair: {
          status: "sure",
          text: "chair text",
          name: null,
          designation: null,
          match: match(chair),
          candidates: [],
          reason: null,
        },
      }),
      opts,
    );
    expect(plan.chair).toMatchObject({ kind: "sure", person: { id: "c" } });
    expect(plan.addPeople.map((p) => p.id)).toEqual(["c"]);
  });

  it("maybe chair → candidates; unmatched chair → text, name, designation and reason", () => {
    const maybe = planFill(
      response({
        chair: {
          status: "maybe",
          text: "t",
          name: null,
          designation: null,
          match: null,
          candidates: [match(officer("p")), match(officer("q"))],
          reason: null,
        },
      }),
      opts,
    );
    expect(maybe.chair).toMatchObject({ kind: "maybe", text: "t" });
    expect(maybe.chair.kind === "maybe" && maybe.chair.candidates.map((c) => c.id)).toEqual([
      "p",
      "q",
    ]);
    expect(maybe.addPeople).toEqual([]);

    const unmatched = planFill(
      response({
        chair: {
          status: "unmatched",
          text: "জনাব করিম, সচিব",
          name: "করিম",
          designation: "সচিব",
          match: null,
          candidates: [],
          reason: "not-found",
        },
      }),
      opts,
    );
    expect(unmatched.chair).toEqual({
      kind: "unmatched",
      text: "জনাব করিম, সচিব",
      name: "করিম",
      designation: "সচিব",
      reason: "not-found",
    });
  });

  it("maybe lines keep at most 3 candidates; unmatched lines keep the reason", () => {
    const plan = planFill(
      response({
        participants: {
          sure: [],
          maybe: [
            {
              ...line(2, "m"),
              candidates: ["a", "b", "c", "d"].map((id) => match(officer(id))),
            },
          ],
          unmatched: [{ ...line(5, "কর্মকর্তা (সকল)"), reason: "group" }],
        },
      }),
      opts,
    );
    expect(plan.maybe[0].candidates.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(plan.unmatched).toEqual([
      { line: 5, text: "কর্মকর্তা (সকল)", name: null, designation: null, reason: "group" },
    ]);
    expect(plan.stats).toMatchObject({ total: 2, sure: 0, maybe: 1, unmatched: 1 });
  });

  it("empty = no field, no chair, no distribution line", () => {
    const plan = planFill(
      response({
        fields: {
          title: null,
          date: null,
          startTime: null,
          endTime: null,
          venue: null,
          agenda: null,
        },
      }),
      opts,
    );
    expect(plan.empty).toBe(true);
  });

  it("keeps the method and the warnings", () => {
    const warnings = [{ code: "AI_FALLBACK", message: "x" }];
    const plan = planFill(response({ method: "AI", warnings }), opts);
    expect(plan.method).toBe("AI");
    expect(plan.warnings).toEqual(warnings);
  });
});

describe("officerToPerson", () => {
  it("copies the names, designation and wing; no photo", () => {
    expect(officerToPerson(officer("z", "জামাল"))).toEqual({
      id: "z",
      nameBn: "জামাল",
      nameEn: "Officer z",
      designation: { nameBn: "পরিচালক", nameEn: "Director" },
      wing: { id: "w1", nameBn: "আইসিটি উইং", nameEn: "ICT Wing" },
      photoPath: null,
    });
  });
});

describe("formHasValues", () => {
  const empty = { title: "", agenda: "", room: "", chairId: "" };
  it("defaults (date / times only) do not count", () => {
    expect(formHasValues(empty, { people: 0, guests: 0 })).toBe(false);
    expect(formHasValues({ ...empty, title: "  " }, { people: 0, guests: 0 })).toBe(false);
  });
  it("typed text, a chair, people or guests count", () => {
    expect(formHasValues({ ...empty, title: "x" }, { people: 0, guests: 0 })).toBe(true);
    expect(formHasValues({ ...empty, room: "x" }, { people: 0, guests: 0 })).toBe(true);
    expect(formHasValues({ ...empty, chairId: "id" }, { people: 0, guests: 0 })).toBe(true);
    expect(formHasValues(empty, { people: 1, guests: 0 })).toBe(true);
    expect(formHasValues(empty, { people: 0, guests: 1 })).toBe(true);
  });
});

describe("fillErrorKind", () => {
  it("maps statuses to the message shown", () => {
    expect(fillErrorKind(new ApiError(429, "x"))).toBe("rateLimited");
    expect(fillErrorKind(new ApiError(422, "x"))).toBe("failed");
    expect(fillErrorKind(new ApiError(404, "x"))).toBe("unavailable");
    expect(fillErrorKind(new ApiError(403, "x"))).toBe("unavailable");
    expect(fillErrorKind(new ApiError(400, "x"))).toBe("other");
    expect(fillErrorKind(new Error("x"))).toBe("other");
  });
});

describe("guestPrefill", () => {
  it("uses the parsed name and designation, else the raw text", () => {
    expect(guestPrefill({ text: "t", name: "করিম", designation: "সচিব" })).toEqual({
      name: "করিম",
      designation: "সচিব",
    });
    expect(guestPrefill({ text: " প্রকল্প পরিচালক ", name: null, designation: null })).toEqual({
      name: "প্রকল্প পরিচালক",
      designation: "",
    });
  });
});
