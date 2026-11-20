import { describe, expect, it } from "vitest";
import { chargeText } from "@/lib/additional-charge";
import { nameHelpers } from "@/lib/display-name";
import {
  chargesWithoutDesignation,
  createSchemas,
  toUserPayload,
  type UserFormValues,
} from "@/lib/schemas";
import { bn, en } from "@/messages";

/** v1.16 structured additional charges (SPEC.md §6.2). */
const dir = { nameBn: "পরিচালক", nameEn: "Director" };
const census = { nameBn: "সেন্সাস উইং", nameEn: "Census Wing" };

describe("additional charge display", () => {
  it('"[পদবি] (অতিরিক্ত দায়িত্ব), [উইং]" + note, in the UI language', () => {
    const c = { designation: dir, wing: census, note: "বিকল্প", needsReview: false };
    expect(chargeText(c, nameHelpers("bn"), bn.profile.chargeSuffix)).toBe(
      "পরিচালক (অতিরিক্ত দায়িত্ব), সেন্সাস উইং — বিকল্প",
    );
    expect(chargeText(c, nameHelpers("en"), en.profile.chargeSuffix)).toBe(
      "Director (additional charge), Census Wing — বিকল্প",
    );
    expect(
      chargeText({ ...c, wing: null, note: null }, nameHelpers("bn"), bn.profile.chargeSuffix),
    ).toBe("পরিচালক (অতিরিক্ত দায়িত্ব)");
  });

  it("a row that needs review shows its old text", () => {
    expect(
      chargeText(
        { designation: null, wing: null, note: "এসডিজি সেল", needsReview: true },
        nameHelpers("bn"),
        bn.profile.chargeSuffix,
      ),
    ).toBe("এসডিজি সেল");
  });
});

describe("admin form validation (charges)", () => {
  const { userFormSchema } = createSchemas(bn);
  const base: UserFormValues = {
    loginEmail: "a@example.com",
    designationId: "d1",
    nameBn: "নাম",
    nameEn: "Name",
    designationRemark: "",
    wingId: "",
    mobile: "",
    mobileAlt: "",
    officePhone: "",
    fax: "",
    organizationBn: "",
    organizationEn: "",
    additionalCharges: [],
  };
  const row = (over: Partial<UserFormValues["additionalCharges"][number]> = {}) => ({
    designationId: "d2",
    wingId: "",
    note: "",
    needsReview: false,
    ...over,
  });
  const issues = (charges: UserFormValues["additionalCharges"]) => {
    const r = userFormSchema.safeParse({ ...base, additionalCharges: charges });
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it("a designation is required (except an untouched row that needs review)", () => {
    expect(issues([row()])).toEqual([]);
    expect(issues([row({ designationId: "" })])).toEqual([bn.validation.chargeDesignationRequired]);
    expect(issues([row({ designationId: "", needsReview: true, note: "পুরনো" })])).toEqual([]);
  });

  it("no charge twice (same designation and wing); the same designation in another wing is fine", () => {
    expect(issues([row({ wingId: "w1" }), row({ wingId: "w1", note: "বিকল্প" })])).toEqual([
      bn.validation.chargeDuplicate,
    ]);
    expect(issues([row({ wingId: "w1" }), row({ wingId: "w2" })])).toEqual([]);
  });

  it("the note is at most 300 characters; at most 20 charges", () => {
    expect(issues([row({ note: "ক".repeat(301) })])).toEqual([bn.validation.chargeTooLong]);
    expect(issues(Array.from({ length: 21 }, (_, i) => row({ designationId: `d${i}` })))).toContain(
      bn.validation.tooManyCharges,
    );
  });

  it("payload: charges only when changed; empty wing and note become null; rows without designation are found", () => {
    const v = { ...base, additionalCharges: [row({ note: "  চলতি দায়িত্ব " })] };
    expect(toUserPayload(v).additionalCharges).toEqual([
      { designationId: "d2", wingId: null, note: "চলতি দায়িত্ব" },
    ]);
    expect("additionalCharges" in toUserPayload(v, false)).toBe(false);
    expect(
      chargesWithoutDesignation({
        additionalCharges: [row(), row({ designationId: "", needsReview: true })],
      }),
    ).toEqual([1]);
  });
});
