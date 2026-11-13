import { expect, test, type Page } from "@playwright/test";
import { pageAs } from "./support/helpers";

/** Every input, select and textarea has a name from a <label> or aria-label(ledby). */
async function unlabelledFields(page: Page): Promise<string[]> {
  return page.locator("input:not([type=hidden]), select, textarea").evaluateAll((fields) =>
    fields
      .filter((f) => {
        const el = f as HTMLInputElement;
        const labelled = (el.labels?.length ?? 0) > 0;
        return !labelled && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby");
      })
      .map((f) => f.outerHTML.slice(0, 120)),
  );
}

test("every form field has a label (officer and admin pages)", async ({ browser }) => {
  const officer = await pageAs(browser, "officer");
  const admin = await pageAs(browser, "admin");
  try {
    for (const [page, paths] of [
      [officer, ["/meetings", "/meetings/new", "/reports", "/profile", "/change-password"]],
      [
        admin,
        [
          "/admin/users",
          "/admin/users/new",
          "/admin/designations",
          "/admin/reports",
          "/admin/audit-logs",
          "/admin/email-outbox",
        ],
      ],
    ] as const) {
      for (const path of paths) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByText("লোড হচ্ছে…")).toHaveCount(0);
        expect(await unlabelledFields(page), `fields without a label on ${path}`).toEqual([]);
      }
    }
  } finally {
    await officer.context().close();
    await admin.context().close();
  }
});

test("modals keep keyboard focus inside, close with Escape and return focus", async ({
  browser,
}) => {
  const page = await pageAs(browser, "admin");
  try {
    await page.goto("/admin/designations");
    const opener = page
      .getByTestId("designation-table")
      .getByRole("button", { name: /^সম্পাদনা/ })
      .first();
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Tab through more elements than the dialog has: focus never reaches the page behind it.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const insideOrBrowser = await page.evaluate(() => {
        const active = document.activeElement;
        return !active || active === document.body || !!active.closest("dialog[open]");
      });
      expect(insideOrBrowser, `focus left the dialog after ${i + 1} Tab presses`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  } finally {
    await page.context().close();
  }
});

test("offline message, toasts and the conflict panel are announced (aria-live)", async ({
  browser,
}) => {
  const page = await pageAs(browser, "officer");
  try {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "ড্যাশবোর্ড", level: 1 })).toBeVisible();
    await page.context().setOffline(true);
    await expect(page.getByRole("alert").filter({ hasText: "ইন্টারনেট সংযোগ নেই।" })).toBeVisible();
    await page.context().setOffline(false);
    await expect(page.getByText("ইন্টারনেট সংযোগ ফিরে এসেছে।")).toBeVisible();

    await expect(page.locator("[aria-live]").first()).toBeAttached();
    await page.goto("/meetings/new");
    await expect(page.getByTestId("conflict-panel")).toHaveAttribute("aria-live", "polite");
  } finally {
    await page.context().close();
  }
});

test("unknown page: Bangla 404 page", async ({ browser }) => {
  const page = await pageAs(browser, "officer");
  try {
    const res = await page.goto("/no-such-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "পাতাটি পাওয়া যায়নি" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ড্যাশবোর্ডে যান" })).toBeVisible();
  } finally {
    await page.context().close();
  }
});
