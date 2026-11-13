import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { pageAs } from "./support/helpers";

test("reports: period selector, summary, chart and PDF download", async ({ browser }) => {
  const page = await pageAs(browser, "officer");
  try {
    await page.goto("/reports?period=month&date=2026-11-15");
    await expect(page.getByRole("heading", { name: "রিপোর্ট", level: 1 })).toBeVisible();

    // Month range in Bangla, from the backend label.
    await expect(page.getByText("নভেম্বর ২০২৬", { exact: true })).toBeVisible();
    await expect(page.getByTestId("report-range")).toHaveText(
      "১ নভেম্বর ২০২৬ থেকে ৩০ নভেম্বর ২০২৬",
    );

    // Summary cards, status breakdown and the chart are there.
    await expect(page.getByText("মোট সভা", { exact: true })).toBeVisible();
    await expect(page.getByText("মোট ঘণ্টা", { exact: true })).toBeVisible();
    await expect(page.getByTestId("status-breakdown")).toContainText("সম্পন্ন");
    await expect(page.getByTestId("meetings-chart")).toBeVisible();

    // "আগের" moves one month back; the address keeps the choice.
    await page.getByRole("button", { name: "আগের", exact: true }).click();
    await expect(page).toHaveURL(/date=2026-10-01/);
    await expect(page.getByTestId("report-range")).toHaveText(
      "১ অক্টোবর ২০২৬ থেকে ৩১ অক্টোবর ২০২৬",
    );

    // Fiscal year: July to June.
    await page.getByRole("tab", { name: "অর্থবছর" }).click();
    await expect(page.getByTestId("report-range")).toHaveText("১ জুলাই ২০২৬ থেকে ৩০ জুন ২০২৭");

    // PDF: "তৈরি হচ্ছে…" while waiting, then a file named by Content-Disposition.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF ডাউনলোড" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("meeting-report-fy-2026-27.pdf");
    const file = await download.path();
    expect(readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");
    await expect(page.getByRole("button", { name: "PDF ডাউনলোড" })).toBeEnabled();
  } finally {
    await page.context().close();
  }
});
