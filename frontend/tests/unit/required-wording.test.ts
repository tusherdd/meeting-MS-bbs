import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bn, en } from "@/messages";

const root = join(__dirname, "..", "..");
const source = (lang: "bn" | "en") => readFileSync(join(root, "messages", `${lang}.ts`), "utf8");

/** Every text of a message tree; functions are called with sample arguments. */
function texts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    const args = Array.from({ length: value.length }, () => "x");
    const out: unknown = (value as (...a: string[]) => unknown)(...args);
    return texts(out);
  }
  if (Array.isArray(value)) return value.flatMap(texts);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(texts);
  return [];
}

/**
 * v1.17 part 3 (SPEC.md §13.6a): optional fields show nothing extra; required fields show the
 * shared mark "*" + "আবশ্যক" / "Required" (components/ui/field.tsx). The old words must not come back.
 */
describe("v1.17 part 3: no optional wording in the message files", () => {
  it('"ঐচ্ছিক" appears nowhere in bn.ts / en.ts', () => {
    for (const lang of ["bn", "en"] as const) expect(source(lang)).not.toContain("ঐচ্ছিক");
  });

  it('"optional" / "(optional)" appears in no English or Bangla UI text', () => {
    for (const lang of ["bn", "en"] as const) {
      expect(source(lang)).not.toMatch(/\(optional\)/i);
    }
    for (const text of [...texts(bn), ...texts(en)]) {
      expect(text).not.toMatch(/\boptional\b|ঐচ্ছিক/i);
    }
  });

  it("no separate required notes: only the shared mark word, without brackets", () => {
    expect(bn.common.required).toBe("আবশ্যক");
    expect(en.common.required).toBe("Required");
    for (const text of [...texts(bn), ...texts(en)]) {
      expect(text).not.toMatch(/\(আবশ্যক\)|\(required\)|^আবশ্যক।|^Required\./i);
    }
  });
});
