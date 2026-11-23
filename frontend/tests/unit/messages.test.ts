import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { localeCookie, localeFromCookieString, parseLocale } from "@/lib/i18n";
import { bn, en, messagesFor } from "@/messages";

/** Shape of a message tree: keys and value kinds (functions compared by arity). */
function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (Array.isArray(value)) return value.map(shape);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, shape((value as Record<string, unknown>)[k])]),
    );
  }
  return typeof value;
}

/** Every string an object tree produces; functions are called with sample arguments. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    const fn = value as (...a: unknown[]) => unknown;
    return strings(fn(...Array.from({ length: fn.length }, () => 3)));
  }
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

const BANGLA = /[ঀ-৿]/;

describe("messages (v1.6)", () => {
  it("en.ts and bn.ts have exactly the same keys", () => {
    expect(shape(en)).toEqual(shape(bn));
  });

  it("en.ts has no Bangla characters (source and produced texts)", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../messages/en.ts", import.meta.url)),
      "utf8",
    );
    // The only Bangla allowed in en.ts would be in comments; there is none.
    expect(source.split("\n").filter((l) => BANGLA.test(l))).toEqual([]);
    expect(strings(en).filter((s) => BANGLA.test(s))).toEqual([]);
  });

  it("the language switch shows the other language in its own script", () => {
    expect(bn.language.name).toBe("বাংলা");
    expect(en.language.name).toBe("English");
    expect(messagesFor("en")).toBe(en);
    expect(messagesFor("bn")).toBe(bn);
  });

  it("lang cookie: en is the default; invalid values fall back to en", () => {
    expect(parseLocale(undefined)).toBe("en");
    expect(parseLocale("xx")).toBe("en");
    expect(parseLocale("bn")).toBe("bn");
    expect(localeFromCookieString("a=1; lang=bn; b=2")).toBe("bn");
    expect(localeFromCookieString("lang=fr")).toBe("en");
    expect(localeFromCookieString("")).toBe("en");
    expect(localeCookie("bn", false)).toBe("lang=bn; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(localeCookie("en", true)).toMatch(/; Secure$/);
  });
});

describe("v1.13 wording (SPEC.md §6.8, §6.9, §13.19)", () => {
  // The old v1.11 Bangla name, built from code points (it must not appear in the sources).
  const OLD_BN = String.fromCharCode(
    0x09b8, 0x09ad, 0x09be, 0x20,
    0x09b8, 0x09bf, 0x09a6, 0x09cd, 0x09a7, 0x09be, 0x09a8, 0x09cd, 0x09a4,
  );

  it("the minutes are \"সভা কার্যবিবরণী\" / \"Meeting minutes\" (menu, page, row menu)", () => {
    expect(bn.nav.decisions).toBe("সভা কার্যবিবরণী");
    expect(bn.decisions.title).toBe("সভা কার্যবিবরণী");
    expect(en.nav.decisions).toBe("Meeting minutes");
    expect(en.decisions.title).toBe("Meeting minutes");
    expect(bn.rowMenu.upload).toBe("কার্যবিবরণী আপলোড");
    expect(en.rowMenu.upload).toBe("Upload minutes");
  });

  it("v1.15: the row menu words (Bangla only in bn, own keys; other buttons unchanged)", () => {
    expect([bn.rowMenu.view, bn.rowMenu.viewNotice, bn.rowMenu.upload, bn.rowMenu.edit, bn.rowMenu.cancel]).toEqual([
      "বিস্তারিত দেখুন",
      "নোটিশ দেখুন",
      "কার্যবিবরণী আপলোড",
      "Edit",
      "বাতিল করুন",
    ]);
    expect([en.rowMenu.view, en.rowMenu.upload, en.rowMenu.edit, en.rowMenu.cancel]).toEqual([
      "View details",
      "Upload minutes",
      "Edit",
      "Cancel",
    ]);
    // Buttons elsewhere keep their words.
    expect(bn.common.cancel).toBe("Cancel");
    expect(bn.meetingDetail.edit).toBe("Edit");
  });

  it("v1.15: notes are \"নোট\" / \"Notes\" (complete form and detail page)", () => {
    expect([bn.meetingDetail.notesLabel, bn.meetingDetail.notes]).toEqual(["নোট", "নোট"]);
    expect([en.meetingDetail.notesLabel, en.meetingDetail.notes]).toEqual(["Notes", "Notes"]);
  });

  it("the old name never comes back in any produced text", () => {
    expect(strings(bn).filter((s) => s.includes(OLD_BN))).toEqual([]);
    expect(strings(en).filter((s) => /meeting decisions?\b|upload decision\b/i.test(s))).toEqual(
      [],
    );
  });

  it("the notice field: label and hint as decided, never marked optional", () => {
    expect([bn.notice.label, bn.notice.hint]).toEqual([
      "সভার নোটিশ",
      "PDF, DOCX, JPG বা PNG; সর্বোচ্চ ১০ MB",
    ]);
    expect([en.notice.label, en.notice.hint]).toEqual([
      "Meeting notice",
      "PDF, DOCX, JPG or PNG; max 10 MB",
    ]);
    for (const text of strings({ bn: bn.notice, en: en.notice })) {
      expect(text).not.toMatch(/ঐচ্ছিক|optional/i);
    }
    // v1.17: the row menu item depends on the notice type.
    expect([bn.rowMenu.viewNotice, bn.rowMenu.downloadNotice]).toEqual(["নোটিশ দেখুন", "নোটিশ ডাউনলোড"]);
    expect([en.rowMenu.viewNotice, en.rowMenu.downloadNotice]).toEqual(["View notice", "Download notice"]);
  });

  it("v1.17: the file viewer panel texts", () => {
    expect([bn.fileViewer.view, bn.fileViewer.download, bn.fileViewer.close]).toEqual([
      "দেখুন",
      "ডাউনলোড",
      "Close",
    ]);
    expect([en.fileViewer.view, en.fileViewer.download, en.fileViewer.close]).toEqual([
      "View",
      "Download",
      "Close",
    ]);
    expect(bn.fileViewer.cantShow).toBe("এই ফোনে এখানে দেখা যাচ্ছে না।");
    expect(en.fileViewer.cantShow).toBe("This file can't be shown here on this device.");
    expect([bn.fileViewer.openNewTab, en.fileViewer.openNewTab]).toEqual([
      "নতুন ট্যাবে খুলুন",
      "Open in new tab",
    ]);
    expect([bn.rowMenu.viewMinutes, en.rowMenu.viewMinutes]).toEqual(["কার্যবিবরণী দেখুন", "View minutes"]);
    // v1.17 part 2: DOCX-only minutes and the panel header link.
    expect([bn.rowMenu.downloadMinutes, en.rowMenu.downloadMinutes]).toEqual([
      "কার্যবিবরণী ডাউনলোড",
      "Download minutes",
    ]);
    expect([bn.fileViewer.manageMinutes, en.fileViewer.manageMinutes]).toEqual([
      "ফাইল যোগ / মুছুন",
      "Add / remove files",
    ]);
  });

  it("v1.19: minutes required checkbox and the detail line (SPEC.md §6.9)", () => {
    expect(bn.meetingForm.minutesRequired).toBe("এই সভার কার্যবিবরণী আপলোড করতে হবে");
    expect(en.meetingForm.minutesRequired).toBe("Minutes must be uploaded for this meeting");
    // "প্রয়োজন" with YYA as U+09AF U+09BC (SPEC.md §13.13), built from code points.
    const proyojon = String.fromCharCode(0x09aa, 0x09cd, 0x09b0, 0x09af, 0x09bc, 0x09cb, 0x099c, 0x09a8);
    expect(bn.decisions.notRequired).toBe(`এই সভার কার্যবিবরণী ${proyojon} নেই।`);
    expect(en.decisions.notRequired).toBe("Minutes are not required for this meeting.");
  });
});
