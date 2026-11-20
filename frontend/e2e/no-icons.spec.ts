import { expect, test, type Page } from "@playwright/test";
import { pageAs } from "./support/helpers";
import { OFFICERS } from "./support/officers";

/**
 * Owner decisions 2026-11-09 and 2026-11-14 (SPEC.md §13.5): no icons in the UI, except two in
 * the top header: the notification bell and the profile icon. Everything else is text only.
 * v1.8 (SPEC.md §13.16): the BBS logo is allowed only in the app header (next to the app name,
 * linking to the dashboard) and above the form on login / forgot-password / reset-password.
 * v1.10: the three-dot "More actions" button of meeting rows is the one allowed exception (its
 * "⋮" glyph only, aria-hidden, inside the labelled menu button).
 * Checks the layout, header, sidebar, dropdowns, drawer and every built page.
 */
const ICON_SELECTOR = [
  // The two allowed header icons carry data-header-icon; where they sit is checked separately.
  "svg:not([data-header-icon])",
  "i",
  "[class*='icon' i]",
  "[data-icon]",
  "[role='img']",
  // Profile photos are content, not icons; the BBS logo is checked separately below.
  "img:not([src^='/uploads/']):not([data-brand-logo])",
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
  // v1.10 (owner decision 2026-11-17): the three dots of the meeting row menu are the one
  // allowed symbol outside the header, only as the aria-hidden glyph inside its labelled button.
  const glyphs = await page.locator("[data-row-menu-glyph]").evaluateAll((elements) =>
    elements.map((e) => ({
      inButton: !!e.closest("button[data-row-menu-button][aria-label][aria-haspopup='menu']"),
      hidden: e.getAttribute("aria-hidden") === "true",
      text: e.textContent?.trim(),
    })),
  );
  expect(
    glyphs.filter((g) => !g.inButton || !g.hidden || g.text !== "\u22ee"),
    `row menu glyph out of place on ${where}`,
  ).toEqual([]);
  const text = await page
    .locator("body")
    .evaluate((body) => {
      // innerText without the allowed glyphs (they are the only "⋮" that may appear).
      const glyphEls = Array.from(body.querySelectorAll<HTMLElement>("[data-row-menu-glyph]"));
      const saved = glyphEls.map((g) => g.textContent);
      glyphEls.forEach((g) => (g.textContent = ""));
      const result = (body as HTMLElement).innerText;
      glyphEls.forEach((g, i) => (g.textContent = saved[i]));
      return result;
    });
  expect(text, `icon character on ${where}`).not.toMatch(ICON_CHARACTERS);

  // The BBS logo: only in its two places.
  const logos = await page.locator("img[data-brand-logo]").evaluateAll((elements) =>
    elements.map((e) => ({
      kind: e.getAttribute("data-brand-logo"),
      header: !!e.closest('header a[href="/dashboard"]'),
    })),
  );
  const path = new URL(page.url()).pathname;
  if (LOGO_PAGES.includes(path)) {
    expect(logos, `logo on ${where}`).toEqual([{ kind: "public", header: false }]);
  } else if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    expect(logos, `logo on ${where}`).toEqual([]);
  } else {
    expect(
      logos.filter((l) => !(l.kind === "header" && l.header)),
      `logo outside the app header on ${where}`,
    ).toEqual([]);
    expect(logos.length, `header logos on ${where}`).toBeLessThanOrEqual(1);
  }
}

/** v1.8: pages that show the large logo; the other public pages show none. */
const LOGO_PAGES = ["/login", "/forgot-password", "/reset-password"];
const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/set-password",
];

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
    "/conflicts",
    "/decisions",
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
  await expect(page.getByRole("button", { name: /^Notification(, .+টি Unread)?$/ })).toBeVisible();
  await expect(page.locator("header svg[data-header-icon='bell']")).toHaveCount(1);
  await expect(page.locator("header svg[data-header-icon='profile']")).toHaveCount(1);
  await page.getByRole("button", { name: /^Notification/ }).click();
  await expect(page.getByRole("button", { name: "Mark all as read" })).toBeVisible();
  await expectNoIcons(page, "notification dropdown");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: OFFICERS.officer.nameBn }).click();
  await expect(page.getByRole("button", { name: "লগআউট" })).toBeVisible();
  await expectNoIcons(page, "user menu");
  await page.keyboard.press("Escape");

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
  for (const path of ["/dashboard", "/meetings/new", "/reports"]) {
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
    await page.getByRole("button", { name: "Reset to Default Password" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoIcons(page, "confirmation dialog");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  } finally {
    await page.context().close();
  }
});
