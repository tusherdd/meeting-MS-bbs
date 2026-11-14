import { expect, test, type Page } from "@playwright/test";
import { pageAs } from "./support/helpers";
import { OFFICERS } from "./support/officers";

/**
 * Owner decisions 2026-11-09 and 2026-11-14 (SPEC.md §13.5): no icons in the UI, except two in
 * the top header: the notification bell and the profile icon. Everything else is text only.
 * Checks the layout, header, sidebar, dropdowns, drawer and every built page.
 */
const ICON_SELECTOR = [
  // The two allowed header icons carry data-header-icon; where they sit is checked separately.
  "svg:not([data-header-icon])",
  "i",
  "[class*='icon' i]",
  "[data-icon]",
  "[role='img']",
  "img:not([src^='/uploads/'])", // profile photos are content, not icons
].join(", ");

/** Every visible button except the two header icon buttons (those have an aria-label instead). */
const TEXT_BUTTONS =
  "button:visible:not([data-testid='notifications-button']):not([data-testid='user-menu-button'])";

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

  // Exactly the two header icons are allowed: at most one bell and one profile icon, each
  // inside its own header button (the profile icon is replaced by the photo when there is one).
  const allowed = await page.locator("svg[data-header-icon]").evaluateAll((elements) =>
    elements.map((e) => {
      const kind = e.getAttribute("data-header-icon");
      const button = kind === "bell" ? "notifications-button" : "user-menu-button";
      return { kind, inPlace: !!e.closest(`header [data-testid="${button}"]`) };
    }),
  );
  expect(
    allowed.filter((a) => !a.inPlace),
    `header icon outside its button on ${where}`,
  ).toEqual([]);
  expect(
    allowed.filter((a) => a.kind === "bell").length,
    `bell icons on ${where}`,
  ).toBeLessThanOrEqual(1);
  expect(
    allowed.filter((a) => a.kind === "profile").length,
    `profile icons on ${where}`,
  ).toBeLessThanOrEqual(1);
  expect(allowed.every((a) => a.kind === "bell" || a.kind === "profile")).toBe(true);
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

  // Header: the two icon buttons, each with an aria-label and a tooltip.
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: /^নোটিফিকেশন(, .+টি অপঠিত)?$/ })).toBeVisible();
  await expect(page.locator("header svg[data-header-icon='bell']")).toHaveCount(1);
  await expect(page.locator("header svg[data-header-icon='profile']")).toHaveCount(1);
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
      .locator(TEXT_BUTTONS)
      .evaluateAll((buttons) =>
        buttons.filter((b) => !(b as HTMLElement).innerText.trim()).map((b) => b.outerHTML),
      );
    expect(empty, `buttons without visible text on ${path}`).toEqual([]);
  }
  await page.context().close();
});

test("no icons on any admin page", async ({ browser }) => {
  const page = await pageAs(browser, "admin");
  const pages = [
    "/admin",
    "/admin/users",
    "/admin/users/new",
    "/admin/designations",
    "/admin/wings",
    "/admin/change-requests",
    "/admin/meetings",
    "/admin/conflicts",
    "/admin/reports",
    "/admin/email-outbox",
    "/admin/audit-logs",
  ];
  try {
    for (const path of pages) {
      await page.goto(path);
      await expect(page.getByRole("navigation", { name: "অ্যাডমিন মেনু" })).toBeVisible();
      await expect(page.getByText("লোড হচ্ছে…")).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoIcons(page, path);
      const empty = await page
        .locator(TEXT_BUTTONS)
        .evaluateAll((buttons) =>
          buttons.filter((b) => !(b as HTMLElement).innerText.trim()).map((b) => b.outerHTML),
        );
      expect(empty, `buttons without visible text on ${path}`).toEqual([]);
    }
    // A user detail page with its action buttons and a confirmation dialog.
    await page.goto("/admin/users?role=OFFICER");
    await page
      .getByTestId("users-table")
      .getByRole("link", { name: /^খুলুন/ })
      .first()
      .click();
    await expect(page.getByTestId("user-actions")).toBeVisible();
    await expectNoIcons(page, "user detail");
    await page.getByRole("button", { name: "পাসওয়ার্ড ডিফল্টে ফেরত নিন" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoIcons(page, "confirmation dialog");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  } finally {
    await page.context().close();
  }
});
