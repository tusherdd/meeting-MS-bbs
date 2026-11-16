import { expect, test, type Page } from "@playwright/test";
import { en } from "../messages/en";
import { bn } from "../messages/bn";
import { OFFICERS } from "./support/officers";
import { apiAsPage, pageAs } from "./support/helpers";

/**
 * v1.7 (SPEC.md §13.15): officer, designation and wing names follow the UI language —
 * English value in English mode (Bangla when the English one is empty), Bangla in Bangla mode.
 */
const officer = OFFICERS.officer;

interface Designation {
  nameBn: string;
  nameEn: string;
}

async function designationBnOf(page: Page, nameEn: string): Promise<string> {
  const list = await apiAsPage<Designation[]>(page, "GET", "/designations");
  const d = list.find((x) => x.nameEn === nameEn);
  if (!d) throw new Error(`designation ${nameEn} not found`);
  return d.nameBn;
}

test("English mode: Welcome shows the English name; Bangla mode shows the Bangla name", async ({
  browser,
}) => {
  const enPage = await pageAs(browser, "officer", "en");
  try {
    await enPage.goto("/dashboard");
    await expect(enPage.getByText(en.dashboard.greeting(officer.nameEn))).toBeVisible();
    await expect(enPage.getByText(officer.nameBn, { exact: false })).toHaveCount(0);
    // Header menu: name and designation in English too.
    await enPage.getByTestId("user-menu-button").click();
    const header = enPage.getByTestId("user-menu-header");
    await expect(header).toContainText(officer.nameEn);
    await expect(header).toContainText(officer.designationEn);
  } finally {
    await enPage.context().close();
  }

  const bnPage = await pageAs(browser, "officer", "bn");
  try {
    await bnPage.goto("/dashboard");
    await expect(bnPage.getByText(bn.dashboard.greeting(officer.nameBn))).toBeVisible();
    await expect(bnPage.getByText(officer.nameEn)).toHaveCount(0);
  } finally {
    await bnPage.context().close();
  }
});

test("Admin officers list: English names and designations in English mode, Bangla in Bangla mode", async ({
  browser,
}) => {
  const query = `/admin/users?q=${encodeURIComponent(officer.loginEmail)}`;

  const enPage = await pageAs(browser, "admin", "en");
  try {
    await enPage.goto(query);
    const row = enPage.getByTestId("users-table").locator("tbody tr").first();
    await expect(row).toContainText(officer.nameEn);
    await expect(row).toContainText(officer.designationEn);
    await expect(row).not.toContainText(officer.nameBn);
  } finally {
    await enPage.context().close();
  }

  const bnPage = await pageAs(browser, "admin", "bn");
  try {
    await bnPage.goto(query);
    const designationBn = await designationBnOf(bnPage, officer.designationEn);
    const row = bnPage.getByTestId("users-table").locator("tbody tr").first();
    await expect(row).toContainText(officer.nameBn);
    await expect(row).toContainText(designationBn);
    await expect(row).not.toContainText(officer.nameEn);
  } finally {
    await bnPage.context().close();
  }
});

test("English mode falls back to the Bangla name when the English one is empty", async ({
  browser,
}) => {
  const page = await pageAs(browser, "officer", "en");
  try {
    // No stored English name can be empty (NOT NULL + validation), so the API answer is
    // changed in the browser to check the UI rule itself.
    await page.route("**/api/v1/auth/me", async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as Record<string, unknown>;
      await route.fulfill({ response: res, json: { ...body, nameEn: "" } });
    });
    await page.goto("/dashboard");
    await expect(page.getByText(en.dashboard.greeting(officer.nameBn))).toBeVisible();
  } finally {
    await page.context().close();
  }
});

test("participant picker search finds an officer by the Bangla or the English name", async ({
  browser,
}) => {
  const page = await pageAs(browser, "dd1", "en");
  try {
    for (const q of [OFFICERS.so.nameEn, OFFICERS.so.nameBn]) {
      const res = await apiAsPage<{ items: { nameEn: string }[] }>(
        page,
        "GET",
        `/users/directory?q=${encodeURIComponent(q)}&limit=5`,
      );
      expect(res.items.map((i) => i.nameEn)).toContain(OFFICERS.so.nameEn);
    }
  } finally {
    await page.context().close();
  }
});
