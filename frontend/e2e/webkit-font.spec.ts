import { expect, test } from "@playwright/test";

/**
 * v1.5 (SPEC.md §13.10): WebKit (Safari and every iOS browser) draws NikoshBAN's য় (YA + NUKTA,
 * the stored form, §13.13) with the nukta dot detached; Chromium draws the precomposed U+09DF
 * that way, so no text form works for both. WebKit therefore gets Kohinoor Bangla (Apple
 * systems) or the bundled Noto Sans Bengali; the root layout marks it with
 * <html data-engine="webkit"> from the User-Agent, server side (no flash).
 *
 * The letters are built from code points (bangla-source.spec.ts rule).
 */
const ch = (...codes: number[]) => String.fromCharCode(...codes);
const YYA = ch(0x09af, 0x09bc); // stored form: YA + NUKTA
const WORDS = [`সম${YYA}`, `প্রল${YYA}`, `নি${YYA}ম`];

test("WebKit: Bangla is not drawn with NikoshBAN and য় is joined (screenshot)", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "webkit", "WebKit only");
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "লগইন", level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-engine", "webkit");

  // A specimen in the page's own font stack (appended after hydration, so React keeps it).
  await page.evaluate((words) => {
    const box = document.createElement("div");
    box.id = "yya-specimen";
    box.style.cssText =
      "position:fixed;left:0;top:0;z-index:9999;background:#fff;color:#000;padding:8px 16px;font-size:64px;line-height:1.5;white-space:nowrap";
    box.textContent = words.join("  ");
    document.body.appendChild(box);
  }, WORDS);

  const { stacks, loaded } = await page.evaluate(async () => {
    await document.fonts.ready;
    const stacks = new Set<string>();
    for (const el of document.querySelectorAll("body, body *")) {
      if (el.closest("nextjs-portal")) continue; // Next.js dev overlay
      stacks.add(getComputedStyle(el).fontFamily);
    }
    return {
      stacks: [...stacks],
      loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
    };
  });
  // No element asks for NikoshBAN in WebKit (Next.js may still preload the file; it is not used).
  expect(stacks.length).toBeGreaterThan(0);
  for (const stack of stacks) {
    expect(stack).toMatch(/^"?Kohinoor Bangla Local"?,\s*"?notoBengali/i);
    expect(stack.toLowerCase()).not.toContain("nikosh");
  }
  // Kohinoor Bangla (Apple systems) or the bundled Noto Sans Bengali draws the Bangla text.
  expect(loaded.some((f) => /kohinoor|noto/i.test(f))).toBe(true);

  // The joined য় (dot under the letter). The baseline was checked by eye; a detached dot fails.
  await expect(page.locator("#yya-specimen")).toHaveScreenshot("yya-webkit.png", {
    maxDiffPixelRatio: 0.01,
  });
});

test("the engine is detected from the User-Agent on the server", async ({
  request,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "engine-independent: runs once");
  const cases: Array<[string, "webkit" | "other"]> = [
    // Safari on macOS and every browser on iPhone / iPad (all WebKit).
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
      "webkit",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      "webkit",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
      "webkit",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15",
      "webkit",
    ],
    [
      "Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/131.0 Version/18.0 Mobile/15E148 Safari/604.1",
      "webkit",
    ],
    // Chromium (Chrome, Edge, Opera, Samsung Internet, Android) and Firefox: NikoshBAN.
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "other",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      "other",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
      "other",
    ],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0", "other"],
  ];
  for (const [ua, engine] of cases) {
    const html = await (await request.get("/login", { headers: { "User-Agent": ua } })).text();
    expect(html.match(/<html[^>]*data-engine="([a-z]+)"/)?.[1], ua).toBe(engine);
  }
});
