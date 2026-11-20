import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { pageAs } from "./support/helpers";

/** Today in Dhaka, "YYYY-MM-DD" (the period buttons always mean the period containing today). */
function dhakaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}

const periodGroup = (page: Page) => page.getByRole("group", { name: "সময়কাল" });
const periodButton = (page: Page, name: string) =>
  periodGroup(page).getByRole("button", { name, exact: true });

test("reports: period buttons, date range picker, summary, chart and PDF download", async ({
  browser,
}) => {
  const page = await pageAs(browser, "officer");
  const today = dhakaToday();
  const [year, month] = today.split("-");
  const lastOfMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  try {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "রিপোর্ট", level: 1 })).toBeVisible();

    // v1.15: four period buttons, no fiscal year; "এই মাস" is selected and fills both dates.
    await expect(periodGroup(page).getByRole("button")).toHaveText([
      "আজ",
      "এই সপ্তাহ",
      "এই মাস",
      "এই বছর",
    ]);
    await expect(page.getByText("অর্থবছর")).toHaveCount(0);
    await expect(periodButton(page, "এই মাস")).toHaveAttribute("aria-pressed", "true");
    const start = page.getByLabel("শুরুর তারিখ");
    const end = page.getByLabel("শেষ তারিখ");
    const apply = page.getByRole("button", { name: "দেখুন", exact: true });
    await expect(start).toHaveValue(`${year}-${month}-01`);
    await expect(end).toHaveValue(`${year}-${month}-${lastOfMonth}`);

    // Summary cards, status breakdown and the chart are there.
    await expect(page.getByText("মোট সভা", { exact: true })).toBeVisible();
    await expect(page.getByText("মোট ঘণ্টা", { exact: true })).toBeVisible();
    await expect(page.getByTestId("status-breakdown")).toContainText("সম্পন্ন");
    await expect(page.getByTestId("meetings-chart")).toBeVisible();

    // A period button fills both dates: this year.
    await periodButton(page, "এই বছর").click();
    await expect(periodButton(page, "এই বছর")).toHaveAttribute("aria-pressed", "true");
    await expect(periodButton(page, "এই মাস")).toHaveAttribute("aria-pressed", "false");
    await expect(start).toHaveValue(`${year}-01-01`);
    await expect(end).toHaveValue(`${year}-12-31`);
    await periodButton(page, "আজ").click();
    await expect(start).toHaveValue(today);
    await expect(end).toHaveValue(today);

    // Rules: the end may not be before the start; at most 2 years. "দেখুন" is disabled meanwhile.
    await start.fill("2026-11-01");
    await end.fill("2026-10-31");
    await expect(page.getByText("শেষ তারিখ শুরুর তারিখের আগে হতে পারে না।")).toBeVisible();
    await expect(apply).toBeDisabled();
    await end.fill("2028-11-01");
    await expect(page.getByText("সময়কাল সর্বোচ্চ ২ বছর হতে পারে।")).toBeVisible();
    await expect(apply).toBeDisabled();

    // A custom range: no period button stays selected; the address keeps it.
    await end.fill("2026-12-15");
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(page).toHaveURL(/from=2026-11-01&to=2026-12-15/);
    for (const name of ["আজ", "এই সপ্তাহ", "এই মাস", "এই বছর"]) {
      await expect(periodButton(page, name)).toHaveAttribute("aria-pressed", "false");
    }
    await expect(
      page.getByText("১ নভেম্বর ২০২৬ – ১৫ ডিসেম্বর ২০২৬", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("report-range")).toHaveText(
      "১ নভেম্বর ২০২৬ থেকে ১৫ ডিসেম্বর ২০২৬",
    );

    // PDF of the custom range: "তৈরি হচ্ছে…" while waiting, then a file named by Content-Disposition.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF ডাউনলোড" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("meeting-report-2026-11-01_2026-12-15.pdf");
    const file = await download.path();
    expect(readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");
    await expect(page.getByRole("button", { name: "PDF ডাউনলোড" })).toBeEnabled();

    // An older period link still works (shown in the date fields, no button selected).
    await page.goto("/reports?period=month&date=2026-10-15");
    await expect(page.getByText("অক্টোবর ২০২৬", { exact: true })).toBeVisible();
    await expect(page.getByTestId("report-range")).toHaveText(
      "১ অক্টোবর ২০২৬ থেকে ৩১ অক্টোবর ২০২৬",
    );
    await expect(start).toHaveValue("2026-10-01");

    // An old link with the removed fiscal year falls back to this month (no error page).
    await page.goto("/reports?period=fiscal-year");
    await expect(periodButton(page, "এই মাস")).toHaveAttribute("aria-pressed", "true");
  } finally {
    await page.context().close();
  }
});
