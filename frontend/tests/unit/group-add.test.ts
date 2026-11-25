import { describe, expect, it } from "vitest";
import { nameHelpers } from "@/lib/display-name";
import { directoryDetail, groupCandidates, groupLabel, hasGroupFilter } from "@/lib/group-add";
import type { DirectoryEntry } from "@/lib/types";
import { bn, en } from "@/messages";

/** v1.20 rework: picker filters name + wing + designation, "add everyone in this list" (SPEC.md §13.6). */
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

describe("participant picker filters", () => {
  it("the add-all button needs a wing or a designation", () => {
    expect(hasGroupFilter({ wingId: "", designationId: "" })).toBe(false);
    expect(hasGroupFilter({ wingId: "w1", designationId: "" })).toBe(true);
    expect(hasGroupFilter({ wingId: "", designationId: "d1" })).toBe(true);
    expect(hasGroupFilter({ wingId: "w1", designationId: "d1" })).toBe(true);
  });

  it("add-all skips the organizer, people already added and officers without a designation", () => {
    const rows = [
      entry("org"),
      entry("a"),
      entry("b"),
      entry("none", { designation: null }),
      entry("c"),
    ];
    expect(groupCandidates(rows, "org", new Set(["b"])).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it('row detail "designation · wing" in the UI language', () => {
    expect(directoryDetail(entry("a"), nameHelpers("bn"), bn.profile.chargeSuffix)).toBe(
      "উপপরিচালক · সেন্সাস উইং",
    );
    expect(directoryDetail(entry("a"), nameHelpers("en"), en.profile.chargeSuffix)).toBe(
      "Deputy Director · Census Wing",
    );
    expect(
      directoryDetail(entry("a", { wing: null }), nameHelpers("en"), en.profile.chargeSuffix),
    ).toBe("Deputy Director");
  });

  it("an officer matched through an additional charge shows that charge", () => {
    const e = entry("a", { matchedCharge: { designation: dir, wing: it_ } });
    expect(directoryDetail(e, nameHelpers("bn"), bn.profile.chargeSuffix)).toBe(
      "পরিচালক (অতিরিক্ত দায়িত্ব) · আইটি উইং",
    );
    // A charge without a wing falls back to the officer's own wing.
    const noWing = entry("b", { matchedCharge: { designation: dir, wing: null } });
    expect(directoryDetail(noWing, nameHelpers("en"), en.profile.chargeSuffix)).toBe(
      "Director (additional charge) · Census Wing",
    );
    // matchedCharge null (main designation matched) → the normal line.
    expect(
      directoryDetail(
        entry("c", { matchedCharge: null }),
        nameHelpers("en"),
        en.profile.chargeSuffix,
      ),
    ).toBe("Deputy Director · Census Wing");
  });

  it("the confirmation names the group", () => {
    expect(groupLabel("উপপরিচালক", "সেন্সাস উইং")).toBe("উপপরিচালক, সেন্সাস উইং");
    expect(groupLabel(null, "সেন্সাস উইং")).toBe("সেন্সাস উইং");
    expect(groupLabel("উপপরিচালক", undefined)).toBe("উপপরিচালক");
  });

  it("button labels count in the UI language", () => {
    expect(bn.picker.addAll("৩")).toBe("এই তালিকার সবাইকে যোগ করুন (৩ জন)");
    expect(en.picker.addAll("3")).toBe("Add everyone in this list (3)");
  });
});
