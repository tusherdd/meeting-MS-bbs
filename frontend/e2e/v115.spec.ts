import { expect, test } from "@playwright/test";
import { pageAs } from "./support/helpers";

/** v1.15 (SPEC.md §12): the calendar is gone — no menu item, and /calendar is the 404 page. */
test("the calendar is gone", async ({ browser }) => {
  const page = await pageAs(browser, "officer");
  try {
    await page.goto("/dashboard");
    const menu = page.getByRole("navigation", { name: "প্রধান মেনু" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: "ক্যালেন্ডার" })).toHaveCount(0);
    const res = await page.goto("/calendar");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("৪০৪")).toBeVisible();
  } finally {
    await page.context().close();
  }
});
