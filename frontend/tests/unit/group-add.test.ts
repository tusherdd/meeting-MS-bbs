import { describe, expect, it } from "vitest";
import { nameHelpers } from "@/lib/display-name";
import { checkedIds, groupCandidates, groupLine, hasGroupFilter } from "@/lib/group-add";
import type { DirectoryEntry } from "@/lib/types";
import { bn, en } from "@/messages";

/** v1.20 group add by wing and / or designation (SPEC.md §13.6). */
const census = { id: "w1", nameBn: "সেন্সাস উইং", nameEn: "Census Wing" };
const it_ = { id: "w2", nameBn: "আইটি উইং", nameEn: "IT Wing" };
const dd = { nameBn: "উপপরিচালক", nameEn: "Deputy Director", priority: 6 };
const dir = { nameBn: "পরিচালক", nameEn: "Director", priority: 4 };

function entry(id: string, extra: Partial<DirectoryEntry> = {}): DirectoryEntry {
  return {
    id,
    nameBn: `কর্মকর্তা ${id}`,
    nameEn: `Officer ${id}`,
    designation: dd,
    wing: census,
    photoPath: null,
    ...extra,
  };
}

describe("group add", () => {
  it("needs at least one filter", () => {
    expect(hasGroupFilter({ wingId: "", designationId: "" })).toBe(false);
    expect(hasGroupFilter({ wingId: "w1", designationId: "" })).toBe(true);
    expect(hasGroupFilter({ wingId: "", designationId: "d1" })).toBe(true);
  });

  it("leaves out the organizer, people already added and officers without a designation", () => {
    const rows = [
      entry("org"),
      entry("a"),
      entry("b"),
      entry("none", { designation: null }),
      entry("c"),
    ];
    expect(groupCandidates(rows, "org", new Set(["b"])).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("everyone is checked until unchecked", () => {
    const rows = [entry("a"), entry("b"), entry("c")];
    expect(checkedIds(rows, new Set())).toEqual(["a", "b", "c"]);
    expect(checkedIds(rows, new Set(["b"]))).toEqual(["a", "c"]);
    expect(checkedIds(rows, new Set(["a", "b", "c"]))).toEqual([]);
  });

  it('"name — designation, wing" in the UI language', () => {
    expect(groupLine(entry("a"), nameHelpers("bn"), bn.profile.chargeSuffix)).toBe(
      "কর্মকর্তা a — উপপরিচালক, সেন্সাস উইং",
    );
    expect(groupLine(entry("a"), nameHelpers("en"), en.profile.chargeSuffix)).toBe(
      "Officer a — Deputy Director, Census Wing",
    );
    expect(groupLine(entry("a", { wing: null }), nameHelpers("en"), en.profile.chargeSuffix)).toBe(
      "Officer a — Deputy Director",
    );
  });

  it("an officer matched through an additional charge shows that charge", () => {
    const e = entry("a", { matchedCharge: { designation: dir, wing: it_ } });
    expect(groupLine(e, nameHelpers("bn"), bn.profile.chargeSuffix)).toBe(
      "কর্মকর্তা a — পরিচালক (অতিরিক্ত দায়িত্ব), আইটি উইং",
    );
    // A charge without a wing falls back to the officer's own wing.
    const noWing = entry("b", { matchedCharge: { designation: dir, wing: null } });
    expect(groupLine(noWing, nameHelpers("en"), en.profile.chargeSuffix)).toBe(
      "Officer b — Director (additional charge), Census Wing",
    );
  });
});
