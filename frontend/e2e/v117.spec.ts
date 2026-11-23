import { expect, test } from "@playwright/test";
import { pageAs } from "./support/helpers";

/**
 * v1.17 (SPEC.md §13.22): the shared file viewer side panel, opened by "PDF দেখুন" on the
 * report page. Dialog semantics, Blob URL in an iframe, Escape / background click / Close,
 * focus back on the opener, page state kept, width (half from 768 px, full screen below).
 */
test("report PDF opens in the file viewer panel and closes again", async ({ browser }) => {
  const page = await pageAs(browser, "officer");
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/reports?from=2026-11-01&to=2026-11-15");
    const open = page.getByRole("button", { name: "PDF দেখুন" });
    await open.click();

    const viewer = page.getByRole("dialog");
    await expect(viewer).toBeVisible();
    await expect(
      viewer.getByRole("heading", { name: "meeting-report-2026-11-01_2026-11-15.pdf" }),
    ).toBeVisible();
    await expect(viewer.getByRole("button", { name: "ডাউনলোড" })).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(viewer.locator("iframe")).toHaveAttribute("src", /^blob:/);
    const box = await viewer.boundingBox();
    expect(box && Math.round(box.width)).toBe(640);
    expect(box && Math.round(box.x + box.width)).toBe(1280);

    // Escape closes; focus returns to the opener; the page kept its range.
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(open).toBeFocused();
    await expect(page.getByLabel("শুরুর তারিখ")).toHaveValue("2026-11-01");

    // A click on the dim background closes it too.
    await open.click();
    await expect(viewer.locator("iframe")).toBeVisible();
    await page.mouse.click(100, 400);
    await expect(viewer).toBeHidden();

    // Below 768 px: full screen.
    await page.setViewportSize({ width: 390, height: 800 });
    await open.click();
    const phone = await viewer.boundingBox();
    expect(phone && Math.round(phone.width)).toBe(390);
    await viewer.getByRole("button", { name: "Close" }).click();
    await expect(viewer).toBeHidden();
  } finally {
    await page.context().close();
  }
});
