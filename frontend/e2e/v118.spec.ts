import { expect, test, type Page } from "@playwright/test";
import { bn } from "../messages/bn";
import { en } from "../messages/en";
import {
  cancelMeetingAs,
  createMeetingAs,
  dhakaDate,
  dhakaIso,
  pageAs,
  uniqueTitle,
} from "./support/helpers";

/**
 * v1.18 (SPEC.md §13.6, §13.12):
 * - "কনকারেন্ট সভা" / "Concurrent meetings" in the menus, page titles and the form panel;
 * - default meeting duration 45 minutes; the end time follows the start time and keeps the duration.
 */
const start = (p: Page) => p.getByLabel(bn.meetingForm.startTime, { exact: true });
const end = (p: Page) => p.getByLabel(bn.meetingForm.endTime, { exact: true });

test("wording: sidebar, page title and form panel say কনকারেন্ট সভা / Concurrent meetings", async ({
  browser,
}) => {
  const page = await pageAs(browser, "dd1");
  try {
    await page.goto("/conflicts");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(bn.conflictsPage.title);
    await expect(page.getByRole("navigation", { name: "প্রধান মেনু" })).toContainText("কনকারেন্ট সভা");
    await page.goto("/meetings/new");
    await expect(page.getByTestId("conflict-panel")).toContainText("কনকারেন্ট সভা যাচাই");
  } finally {
    await page.context().close();
  }
  const enPage = await pageAs(browser, "dd1", "en");
  try {
    await enPage.goto("/conflicts");
    await expect(enPage.getByRole("heading", { level: 1 })).toHaveText(en.conflictsPage.title);
    await expect(enPage.getByRole("heading", { level: 1 })).toHaveText("Concurrent meetings");
  } finally {
    await enPage.context().close();
  }
});

test("create: end = start + 45 min; a later start change keeps the duration", async ({ browser }) => {
  const page = await pageAs(browser, "dd1");
  try {
    await page.goto("/meetings/new");
    await start(page).fill("10:00");
    await expect(end(page)).toHaveValue("10:45");
    await start(page).fill("11:15");
    await expect(end(page)).toHaveValue("12:00");
    // The user sets another end (1 h 30 min) — a later start change keeps 1 h 30 min.
    await end(page).fill("12:45");
    await start(page).fill("14:00");
    await expect(end(page)).toHaveValue("15:30");
    // No duration buttons or duration text came back.
    await expect(page.locator("body")).not.toContainText("৪৫ মিনিট");
  } finally {
    await page.context().close();
  }
});

test("edit: loading keeps the stored end; a start change keeps the stored duration", async ({
  browser,
}) => {
  const page = await pageAs(browser, "dd1");
  const day = dhakaDate(5);
  const meeting = await createMeetingAs(page, {
    title: uniqueTitle("শুরু বদল"),
    startAt: dhakaIso(day, "09:00"),
    endAt: dhakaIso(day, "10:20"),
  });
  try {
    await page.goto(`/meetings/${meeting.id}/edit`);
    await expect(start(page)).toHaveValue("09:00");
    await expect(end(page)).toHaveValue("10:20");
    await start(page).fill("13:00");
    await expect(end(page)).toHaveValue("14:20");
  } finally {
    await cancelMeetingAs(page, meeting.id);
    await page.context().close();
  }
});
