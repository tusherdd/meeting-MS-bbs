import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * v1.8 (SPEC.md §13.16): the theme tokens in app/globals.css meet WCAG AA — 4.5:1 for text,
 * 3:1 for borders of form controls and the focus ring. Reads the real CSS, so a changed colour
 * that breaks a pair fails here.
 */
const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

function token(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --color-${name} not found`);
  return m[1];
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = "#ffffff";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** [foreground, background, where it is used] — text pairs, 4.5:1. */
const TEXT_PAIRS: Array<[string, string, string]> = [
  ["text", "white", "body text on cards"],
  ["text", "primary-tint", "body text on the page background"],
  ["text-muted", "white", "muted text on cards"],
  ["text-muted", "primary-tint", "muted text on the page background"],
  ["text-muted", "slate-50", "table header text"],
  ["text-muted", "slate-100", "neutral badge / disabled field"],
  ["placeholder", "white", "input placeholder"],
  ["white", "primary", "primary button"],
  ["white", "primary-hover", "primary button hover"],
  ["primary", "white", "links"],
  ["primary", "primary-tint", "links on the page background"],
  ["brand-800", "brand-50", "active menu item / green badge"],
  ["brand-900", "brand-100", "green badge"],
  ["brand-900", "brand-50", "green conflict panel / success alert"],
  ["danger-text", "white", "error text under a field"],
  ["danger-text", "red-50", "error text in an alert"],
  ["white", "danger-fill", "danger button"],
  ["white", "red-700", "danger button hover"],
  ["text", "autofill", "v1.21: field text on the filled-from-notice background"],
  ["autofill-text", "autofill", "v1.21: the from-notice tag"],
  ["autofill-text", "white", "v1.21: the from-notice tag text next to a label"],
  ["red-800", "red-50", "red badge / error alert"],
  ["red-950", "red-50", "red conflict panel"],
  ["slate-800", "slate-100", "neutral badge"],
];

/** Non-text pairs, 3:1 (WCAG 1.4.11). */
const UI_PAIRS: Array<[string, string, string]> = [
  ["input-border", "white", "form control border"],
  ["primary", "white", "focus ring"],
  ["primary", "primary-tint", "focus ring on the page background"],
  ["danger", "white", "red accent border"],
];

const color = (name: string) => (name === "white" ? WHITE : token(name));

describe("theme contrast (WCAG AA)", () => {
  it("has the logo colours as tokens", () => {
    expect(token("primary").toLowerCase()).toBe("#016b4f");
    expect(token("danger").toLowerCase()).toBe("#e8323f");
    expect(token("text").toLowerCase()).toBe("#1f2937");
    expect(token("text-muted").toLowerCase()).toBe("#4b5563");
    expect(token("border").toLowerCase()).toBe("#e5e7eb");
  });

  it.each(TEXT_PAIRS)("text %s on %s (%s) ≥ 4.5:1", (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)("%s on %s (%s) ≥ 3:1", (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(3);
  });

  it("the red accent and light greys are never used as text colour in components", () => {
    expect(contrast(token("danger"), WHITE)).toBeLessThan(4.5);
    const tooLight = /\btext-(red-(?:300|400|500)|slate-(?:300|400)|gray-\d+|danger)\b/;
    const offenders = ["components", "app"]
      .flatMap((dir) => walk(fileURLToPath(new URL(`../../${dir}`, import.meta.url))))
      .filter((f) => f.endsWith(".tsx"))
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => ({ f, line: i + 1, text: line }))
          .filter(({ text }) => tooLight.test(text)),
      )
      .map(({ f, line, text }) => `${f.split("/frontend/")[1]}:${line} ${text.trim()}`);
    expect(offenders).toEqual([]);
  });

  it("no muted text lighter than #4b5563: slate-500 and slate-600 are that colour", () => {
    expect(token("slate-500").toLowerCase()).toBe("#4b5563");
    expect(contrast(token("slate-500"), WHITE)).toBeGreaterThanOrEqual(
      contrast(token("text-muted"), WHITE),
    );
  });
});
