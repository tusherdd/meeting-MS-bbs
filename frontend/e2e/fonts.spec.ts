import { expect, test } from "@playwright/test";

/**
 * Fonts (SPEC.md §13.10, owner decisions 2026-11-14/15): Bangla in the self-hosted NikoshBAN,
 * limited by unicode-range to Bangla characters, so typed digits 0–9 never use its
 * Bangla-looking digit shapes.
 */
test("NikoshBAN loads in the browser and is limited to Bangla characters", async ({
  page,
  browserName,
}) => {
  // WebKit uses Kohinoor Bangla / Noto Sans Bengali instead (webkit-font.spec.ts).
  test.skip(browserName === "webkit", "WebKit has its own Bangla font (v1.5)");
  const fontResponses: { url: string; status: number }[] = [];
  page.on("response", (res) => {
    if (/\.(ttf|woff2?)(\?|$)/.test(res.url())) {
      fontResponses.push({ url: res.url(), status: res.status() });
    }
  });

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "লগইন", level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-engine", "other");

  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    // Make sure the Bangla face is actually needed and loaded (the browser rejects broken files).
    const family = getComputedStyle(document.body).fontFamily.split(",")[0].trim();
    await document.fonts.load(`16px ${family}`, "বাংলা");
    return [...document.fonts].map((f) => ({
      family: f.family,
      status: f.status,
      unicodeRange: f.unicodeRange,
    }));
  });
  // The WebKit-only faces (Kohinoor local(), Noto Sans Bengali) are declared but never loaded here.
  const loaded = faces.filter((f) => f.status !== "unloaded");

  // The served file is NikoshBAN (the old Nikosh file is gone) and nothing comes from elsewhere.
  expect(fontResponses.length).toBeGreaterThan(0);
  for (const r of fontResponses) {
    expect(r.status).toBe(200);
    expect(new URL(r.url).origin).toBe(new URL(page.url()).origin);
    expect(r.url).toContain("NikoshBAN");
  }

  // Exactly one Bangla face in use, loaded without an error, and only for the Bangla ranges.
  expect(loaded).toHaveLength(1);
  expect(loaded[0].status).toBe("loaded");
  expect(loaded[0].family.toLowerCase()).toContain("nikosh");
  const range = loaded[0].unicodeRange.toUpperCase();
  expect(range).toContain("U+980-9FF");
  expect(range).not.toMatch(/U\+3[0-9]/); // no ASCII digits (U+0030–U+0039)
});
