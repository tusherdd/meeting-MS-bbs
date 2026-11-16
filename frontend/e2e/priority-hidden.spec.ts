import { expect, test, type Page } from "@playwright/test";
import {
  apiAsPage,
  cancelLeftovers,
  cancelMeetingAs,
  createMeetingAs,
  dhakaDate,
  dhakaIso,
  pageAs,
  uniqueTitle,
  userIdOf,
} from "./support/helpers";

/**
 * v1.5 (SPEC.md §6.1): designation / meeting priority numbers are never shown, except on the
 * admin page "পদবি ও অগ্রাধিকার". Pages with priorities behind them (profile, change request
 * select, meeting form and detail, duplicate meetings, notifications, reports) are checked for
 * "অগ্রাধিকার" followed or preceded by a number, and for the removed priority box.
 */
test.describe.configure({ mode: "serial" });

const PRIORITY_NUMBER = /অগ্রাধিকার[:\s(]*[০-৯0-9]|[০-৯0-9]\s*\)?\s*\(?অগ্রাধিকার/;

let so: Page;
let dg: Page;
let admin: Page;
const created: { page: () => Page; id: string }[] = [];

test.beforeAll(async ({ browser }) => {
  [so, dg, admin] = await Promise.all([
    pageAs(browser, "so"),
    pageAs(browser, "dg"),
    pageAs(browser, "admin"),
  ]);
  for (const page of [so, dg]) {
    await page.goto("/dashboard");
    await cancelLeftovers(page);
  }
});

test.afterAll(async () => {
  for (const m of created) await cancelMeetingAs(m.page(), m.id);
  await Promise.all([so, dg, admin].map((p) => p?.context().close()));
});

async function expectNoPriorityNumber(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const text = await page.locator("main").innerText();
  expect(text, `priority number on ${path}`).not.toMatch(PRIORITY_NUMBER);
  await expect(page.getByTestId("meeting-priority")).toHaveCount(0);
}

test("no priority number on officer pages, also with a duplicate meeting", async () => {
  const day = dhakaDate(7);
  // so (7) organizes; dg (2) overrides it with so as a shared officer → a pending conflict.
  const low = await createMeetingAs(so, {
    title: uniqueTitle("অগ্রাধিকার নিম্ন"),
    startAt: dhakaIso(day, "10:00"),
    endAt: dhakaIso(day, "11:00"),
  });
  created.push({ page: () => so, id: low.id });
  const high = await createMeetingAs(dg, {
    title: uniqueTitle("অগ্রাধিকার উচ্চ"),
    startAt: dhakaIso(day, "10:30"),
    endAt: dhakaIso(day, "11:30"),
    participantIds: [await userIdOf(so)],
  });
  created.push({ page: () => dg, id: high.id });
  expect((await apiAsPage<unknown[]>(so, "GET", "/conflicts/mine")).length).toBeGreaterThan(0);

  for (const path of [
    "/dashboard",
    "/profile",
    "/meetings/new",
    `/meetings/${low.id}`,
    `/meetings/${low.id}/edit`,
    `/meetings/${high.id}`,
    "/conflicts",
    "/notifications",
    `/reports?period=day&date=${day}`,
  ]) {
    await expectNoPriorityNumber(so, path);
  }
  // The designation change request select lists names only.
  await so.goto("/profile");
  // Wait until the designations are loaded (placeholder + at least one designation).
  await expect(so.getByLabel("নতুন পদবি").locator("option").nth(1)).toBeAttached();
  const options = await so.getByLabel("নতুন পদবি").locator("option").allInnerTexts();
  expect(options.length).toBeGreaterThan(1);
  for (const o of options) expect(o).not.toMatch(/[০-৯0-9]/);
});

test("admin pages show no priority number, except পদবি ও অগ্রাধিকার", async () => {
  for (const path of [
    "/admin/users/new",
    "/admin/change-requests",
    "/admin/reports",
    "/admin/conflicts",
  ]) {
    await expectNoPriorityNumber(admin, path);
  }
  await admin.goto("/admin/designations");
  await expect(admin.getByRole("heading", { name: "পদবি ও অগ্রাধিকার", level: 1 })).toBeVisible();
  await expect(admin.getByRole("columnheader", { name: "অগ্রাধিকার" })).toBeVisible();
  await expect(admin.getByRole("row").filter({ hasText: "মহাপরিচালক" }).first()).toContainText("২");
});
