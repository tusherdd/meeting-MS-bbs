import { expect, test, type Page } from "@playwright/test";
import { pageAs } from "./support/helpers";
import { OFFICERS } from "./support/officers";

/**
 * Owner decision 2026-11-09 (SPEC.md §13.5): no icons in the UI — text labels only.
 * Checks the layout, header, sidebar, dropdowns, drawer and every built page.
 */
const ICON_SELECTOR = [
  "svg",
  "i",
  "[class*='icon' i]",
  "[data-icon]",
  "[role='img']",
  "img:not([src^='/uploads/'])", // profile photos are content, not icons
].join(", ");

/** Symbols that are typically used as icons. */
const ICON_CHARACTERS = /[✓✔✕✖×‹›«»☰⋮⋯▾▸▼►◀▶←→↑↓🔔🔒⚠️➕✚]/u;

async function expectNoIcons(page: Page, where: string) {
  // Next.js development tooling (error overlay) lives in <nextjs-portal>: not part of the app UI.
  const icons = await page.locator(ICON_SELECTOR).evaluateAll((elements) =>
    elements
      .filter((e) => {
        const root = e.getRootNode();
        return !(root instanceof ShadowRoot && root.host.tagName === "NEXTJS-PORTAL");
      })
      .map((e) => e.outerHTML.slice(0, 120)),
  );
  expect(icons, `icon elements on ${where}`).toEqual([]);
  const text = await page.locator("body").innerText();
  expect(text, `icon character on ${where}`).not.toMatch(ICON_CHARACTERS);
}

test("no icons on the public pages", async ({ page }) => {
  for (const path of ["/login", "/forgot-password", "/reset-password?token=x", "/verify-email"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoIcons(page, path);
  }
});

test("no icons in the app layout, header, sidebar, menus and pages", async ({ browser }) => {
  const page = await pageAs(browser, "officer");
  const pages = [
    "/dashboard",
    "/meetings",
    "/meetings/new",
    "/calendar",
    "/conflicts",
    "/notifications",
    "/change-password",
    "/reports",
    "/profile",
  ];
  for (const path of pages) {
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "প্রধান মেনু" })).toBeVisible();
    await expect(page.getByText("লোড হচ্ছে…")).toHaveCount(0);
    await expectNoIcons(page, path);
  }

  // Header: text buttons with visible labels.
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: /^নোটিফিকেশন( \(.+\))?$/ })).toBeVisible();
  await page.getByRole("button", { name: /^নোটিফিকেশন/ }).click();
  await expect(page.getByRole("button", { name: "সব পড়া হয়েছে" })).toBeVisible();
  await expectNoIcons(page, "notification dropdown");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: OFFICERS.officer.nameBn }).click();
  await expect(page.getByRole("button", { name: "লগআউট" })).toBeVisible();
  await expectNoIcons(page, "user menu");
  await page.keyboard.press("Escape");

  // Calendar navigation uses words.
  await page.goto("/calendar");
  await expect(page.getByRole("button", { name: "আগের" })).toBeVisible();
  await expect(page.getByRole("button", { name: "পরের" })).toBeVisible();
  await page.getByRole("tab", { name: "মাস" }).click();
  await expectNoIcons(page, "calendar month view");

  // Phone: "মেনু" opens the drawer, "বন্ধ করুন" closes it.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "মেনু", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "মেনু" });
  await expect(drawer).toBeVisible();
  await expectNoIcons(page, "phone drawer");
  await drawer.getByRole("button", { name: "বন্ধ করুন" }).click();
  await expect(drawer).toBeHidden();

  // Every button has a visible text label.
  for (const path of ["/dashboard", "/meetings/new", "/calendar"]) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(path);
    await expect(page.getByRole("navigation", { name: "প্রধান মেনু" })).toBeVisible();
    const empty = await page
      .locator("button:visible")
      .evaluateAll((buttons) =>
        buttons.filter((b) => !(b as HTMLElement).innerText.trim()).map((b) => b.outerHTML),
      );
    expect(empty, `buttons without visible text on ${path}`).toEqual([]);
  }
  await page.context().close();
});
