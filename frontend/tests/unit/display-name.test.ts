import { describe, expect, it } from "vitest";
import { matchesName, nameHelpers, pickName, pickOptionalName } from "@/lib/display-name";

const rahim = { nameBn: "মোঃ রহিম উদ্দিন", nameEn: "Md. Rahim Uddin" };

describe("display-name (v1.7)", () => {
  it("English UI: the English value when present", () => {
    expect(pickName("en", rahim.nameBn, rahim.nameEn)).toBe("Md. Rahim Uddin");
    expect(nameHelpers("en").of(rahim)).toBe("Md. Rahim Uddin");
    expect(nameHelpers("en").pick("উপপরিচালক", "Deputy Director")).toBe("Deputy Director");
  });

  it("English UI: falls back to Bangla when the English value is missing or blank", () => {
    expect(pickName("en", "করিম", "")).toBe("করিম");
    expect(pickName("en", "করিম", "   ")).toBe("করিম");
    expect(pickName("en", "করিম", null)).toBe("করিম");
    expect(pickName("en", "করিম")).toBe("করিম");
    expect(nameHelpers("en").of({ nameBn: "করিম" })).toBe("করিম");
  });

  it("Bangla UI: always the Bangla value", () => {
    expect(pickName("bn", rahim.nameBn, rahim.nameEn)).toBe("মোঃ রহিম উদ্দিন");
    expect(nameHelpers("bn").of(rahim)).toBe("মোঃ রহিম উদ্দিন");
    expect(nameHelpers("bn").pick("উপপরিচালক", "Deputy Director")).toBe("উপপরিচালক");
  });

  it("optional values: null stays null in both languages", () => {
    expect(nameHelpers("en").maybe(null)).toBeNull();
    expect(nameHelpers("bn").maybe(undefined)).toBeNull();
    expect(pickOptionalName("en", null, null)).toBeNull();
    expect(pickOptionalName("en", "উইং", "Wing")).toBe("Wing");
    expect(pickOptionalName("bn", "উইং", "Wing")).toBe("উইং");
  });

  it("search matches the Bangla and the English name", () => {
    expect(matchesName(rahim, "rahim")).toBe(true);
    expect(matchesName(rahim, "RAHIM")).toBe(true);
    expect(matchesName(rahim, "রহিম")).toBe(true);
    expect(matchesName(rahim, "karim")).toBe(false);
    expect(matchesName(rahim, "  ")).toBe(true);
  });
});

describe("English name rule (v1.7, same as the backend)", () => {
  it("accepts Latin names and rejects Bangla or letterless text", async () => {
    const { ENGLISH_NAME_PATTERN } = await import("@/lib/display-name");
    for (const ok of ["Md. Rahim Uddin", "Deputy Director (Grade 5)", "ICT Wing 2"]) {
      expect(ENGLISH_NAME_PATTERN.test(ok)).toBe(true);
    }
    for (const bad of ["রহিম", "Md. রহিম", "১২৩", "..."]) {
      expect(ENGLISH_NAME_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe("organizer shown as the wing (v1.9)", () => {
  const wing = { nameBn: "কম্পিউটার উইং", nameEn: "Computer Wing" };
  const designation = { nameBn: "উপপরিচালক", nameEn: "Deputy Director" };

  it("shows the wing in the UI language", () => {
    expect(nameHelpers("en").organizer({ wing, designation })).toBe("Computer Wing");
    expect(nameHelpers("bn").organizer({ wing, designation })).toBe("কম্পিউটার উইং");
  });

  it("falls back to the designation when the organizer has no wing", () => {
    expect(nameHelpers("en").organizer({ wing: null, designation })).toBe("Deputy Director");
    expect(nameHelpers("bn").organizer({ wing: null, designation })).toBe("উপপরিচালক");
  });

  it("English UI uses the Bangla wing when its English name is empty", () => {
    expect(nameHelpers("en").organizer({ wing: { nameBn: "উইং", nameEn: "" }, designation })).toBe(
      "উইং",
    );
  });

  it("shows a dash when there is neither", () => {
    expect(nameHelpers("bn").organizer({ wing: null, designation: null })).toBe("—");
  });

  it("works from separate fields (conflict and report rows)", () => {
    const h = nameHelpers("en");
    expect(h.organizerFrom("কম্পিউটার উইং", "Computer Wing", "উপপরিচালক", "Deputy Director")).toBe(
      "Computer Wing",
    );
    expect(h.organizerFrom(null, null, "উপপরিচালক", "Deputy Director")).toBe("Deputy Director");
    expect(nameHelpers("bn").organizerFrom(null, null, "উপপরিচালক", "Deputy Director")).toBe(
      "উপপরিচালক",
    );
  });
});
