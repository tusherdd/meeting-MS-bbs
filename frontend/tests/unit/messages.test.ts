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
