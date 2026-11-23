import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  cancelMeetingAs,
  createMeetingAs,
  dhakaDate,
  dhakaIso,
  pageAs,
  uniqueTitle,
} from "./support/helpers";

/**
 * v1.15 office report "অফিস রিপোর্ট" (SPEC.md §6.10, §13.21; samples in docs/samples/office-report/):
 * admin, DG (OFFICE), director (WING, locked wing) and a normal officer (no menu item, 403).
 */
test.describe.configure({ mode: "serial" });

const DAY = dhakaDate(11);
const RANGE = `from=${DAY}&to=${DAY}`;
let title = "";
let meetingId = "";
let director: Page;

test.beforeAll(async ({ browser }) => {
  director = await pageAs(browser, "director");
  title = uniqueTitle("অফিস রিপোর্ট");
  meetingId = (
    await createMeetingAs(director, {
      title,
      startAt: dhakaIso(DAY, "10:00"),
      endAt: dhakaIso(DAY, "11:00"),
    })
  ).id;
});

test.afterAll(async () => {
  if (meetingId) await cancelMeetingAs(director, meetingId);
  await director.context().close();
});

const mainMenuLinks = (page: Page) =>
  page.getByRole("navigation", { name: "প্রধান মেনু" }).getByRole("link");

async function expectSampleLayout(page: Page) {
  await expect(page.getByRole("heading", { name: "অফিস রিপোর্ট", level: 1 })).toBeVisible();
  const periods = page.getByRole("group", { name: "সময়কাল" }).getByRole("button");
  await expect(periods).toHaveText(["আজ", "এই সপ্তাহ", "এই মাস", "এই বছর"]);
  await expect(page.getByLabel("শুরুর তারিখ")).toHaveValue(DAY);
  await expect(page.getByLabel("শেষ তারিখ")).toHaveValue(DAY);
  await expect(page.getByRole("button", { name: "দেখুন", exact: true })).toBeVisible();
  await expect(page.getByLabel("উইং", { exact: true })).toBeVisible();
  await expect(page.getByTestId("officer-picker")).toHaveText("সকল কর্মকর্তা");
  const cards = page.getByRole("region", { name: "Summary" });
  for (const label of ["মোট সভা", "চলমান", "সম্পন্ন", "বাতিল", "মোট ঘণ্টা"]) {
    await expect(cards.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "শীর্ষ ৫ অংশগ্রহণকারী" })).toBeVisible();
  await expect(
    page.getByText("আয়োজক, সভাপতি ও সদস্য — সব ভূমিকার সভা গোনা হয়েছে।"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "সবচেয়ে ব্যস্ত ৫ দিন" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "সভার তালিকা" })).toBeVisible();
  await expect(page.getByLabel("অবস্থা", { exact: true })).toBeVisible();
  await expect(page.getByLabel("সভাপতি", { exact: true })).toBeVisible();
  const table = page.getByTestId("office-meetings");
  for (const col of ["তারিখ", "সময়", "বিষয়", "আয়োজক উইং", "সভাপতি", "স্থান", "অবস্থা"]) {
    await expect(table.getByRole("columnheader", { name: col, exact: true })).toBeVisible();
  }
  await expect(table.getByRole("columnheader", { name: "ভূমিকা" })).toHaveCount(0);
  // Old sections are gone; no charts.
  await expect(page.getByText("শীর্ষ ১০ আয়োজক")).toHaveCount(0);
  await expect(page.getByText("পদবি অনুযায়ী")).toHaveCount(0);
  await expect(page.getByTestId("meetings-chart")).toHaveCount(0);
  await expect(table.getByRole("row").filter({ hasText: title })).toBeVisible();
}

test("admin: the sample layout; the item stays in the admin section; /admin/reports redirects", async ({
  browser,
}) => {
  const page = await pageAs(browser, "admin");
  try {
    await page.goto(`/admin/reports?${RANGE}`);
    await expect(page).toHaveURL(new RegExp(`/office-report\\?${RANGE}$`));
    await expectSampleLayout(page);
    await expect(page.getByRole("heading", { name: "উইংভিত্তিক তালিকা" })).toBeVisible();
    await expect(page.getByLabel("আয়োজক উইং", { exact: true })).toBeVisible();
    await expect(page.getByLabel("উইং", { exact: true })).toBeEnabled();
    await expect(page.getByLabel("উইং", { exact: true })).toHaveValue("");
    // Once in the menu, under "অ্যাডমিন".
    const items = mainMenuLinks(page).filter({ hasText: "অফিস রিপোর্ট" });
    await expect(items).toHaveCount(1);
    await expect(items).toHaveAttribute("href", "/office-report");
  } finally {
    await page.context().close();
  }
});

test("DG (OFFICE): the last menu item, below প্রোফাইল; the whole office", async ({ browser }) => {
  const page = await pageAs(browser, "dg");
  try {
    await page.goto(`/office-report?${RANGE}`);
    await expectSampleLayout(page);
    const links = mainMenuLinks(page);
    await expect(links.last()).toHaveText("অফিস রিপোর্ট");
    await expect(links.nth((await links.count()) - 2)).toHaveText("প্রোফাইল");
    await expect(page.getByRole("heading", { name: "উইংভিত্তিক তালিকা" })).toBeVisible();
    await expect(page.getByLabel("আয়োজক উইং", { exact: true })).toBeVisible();
    // Clicking a wing name sets the wing filter (and hides the wing list).
    await page.getByTestId("wing-list").getByRole("button").first().click();
    await expect(page).toHaveURL(/wingId=/);
    await expect(page.getByRole("heading", { name: "উইংভিত্তিক তালিকা" })).toHaveCount(0);
  } finally {
    await page.context().close();
  }
});

test("director (WING): own wing locked, no wing list; the officer filter adds the ভূমিকা column", async () => {
  const page = director;
  await page.goto(`/office-report?${RANGE}`);
  await expectSampleLayout(page);
  await expect(mainMenuLinks(page).last()).toHaveText("অফিস রিপোর্ট");
  const wing = page.getByLabel("উইং", { exact: true });
  await expect(wing).toBeDisabled();
  await expect(wing.locator("option:checked")).toHaveText("কম্পিউটার উইং");
  await expect(page.locator("[data-locked-wing] svg[data-lock-icon]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "উইংভিত্তিক তালিকা" })).toHaveCount(0);
  await expect(page.getByLabel("আয়োজক উইং", { exact: true })).toHaveCount(0);

  // Choose an officer (searchable): the subtitle names them, the ভূমিকা column and filter appear.
  await page.getByTestId("officer-picker").click();
  await page.getByLabel("কর্মকর্তা খুঁজুন").fill("ই২ই পরিচালক");
  // Inside the picker (the header profile button also carries the name).
  await page
    .getByRole("dialog", { name: "কর্মকর্তা" })
    .getByRole("button", { name: /^ই২ই পরিচালক/ })
    .click();
  await expect(page).toHaveURL(/officerId=/);
  await expect(page.getByTestId("office-report-subtitle")).toContainText("জনাব ই২ই পরিচালক");
  const table = page.getByTestId("office-meetings");
  await expect(table.getByRole("columnheader", { name: "ভূমিকা" })).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: title })).toContainText("আয়োজক");
  await expect(page.getByLabel("ভূমিকা", { exact: true })).toBeVisible();

  // The date range picker: a custom range de-selects every period button.
  await page.getByLabel("শেষ তারিখ").fill(dhakaDate(12));
  await page.getByRole("button", { name: "দেখুন", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`to=${dhakaDate(12)}`));
  for (const name of ["আজ", "এই সপ্তাহ", "এই মাস", "এই বছর"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  }

  // The PDF downloads (server-made, same filters and page).
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF দেখুন" }).click();
  // v1.17: the file viewer panel opens; its Download button saves the PDF.
  const viewer = page.getByRole("dialog");
  await expect(viewer.getByRole("heading", { name: `office-report-${DAY}_${dhakaDate(12)}.pdf` })).toBeVisible();
  await viewer.getByRole("button", { name: "ডাউনলোড" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`office-report-${DAY}_${dhakaDate(12)}.pdf`);
  expect(
    readFileSync(await download.path())
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");
});

test("a normal officer: no menu item, the page says 403", async ({ browser }) => {
  const page = await pageAs(browser, "so");
  try {
    await page.goto("/dashboard");
    await expect(mainMenuLinks(page).filter({ hasText: "অফিস রিপোর্ট" })).toHaveCount(0);
    await page.goto("/office-report");
    await expect(page.getByTestId("office-report-blocked")).toContainText("৪০৩");
    await expect(page.getByText("অফিস রিপোর্ট দেখার অনুমতি আপনার নেই।")).toBeVisible();
    const res = await page.request.get("/api/v1/reports/office");
    expect(res.status()).toBe(403);
  } finally {
    await page.context().close();
  }
});
