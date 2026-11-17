import { expect, test, type Page } from "@playwright/test";
import { bn } from "../messages/bn";
import { en } from "../messages/en";
import { OFFICERS } from "./support/officers";
import {
  apiAsPage,
  cancelMeetingAs,
  createMeetingAs,
  dhakaDate,
  fillMeetingTime,
  pageAs,
  uniqueTitle,
} from "./support/helpers";

/**
 * v1.9 (SPEC.md §13.17):
 * - the organizer is shown as their wing (Bangla or English with the UI language) on user pages;
 * - the venue ("স্থান" / "Venue") is required in the meeting form.
 * The test officer "so" gets a wing for this file only (restored afterwards).
 */
const so = OFFICERS.so;

interface Wing {
  id: string;
  nameBn: string;
  nameEn: string;
}

interface Profile {
  wing: Wing | null;
}

async function giveWing(page: Page): Promise<{ wing: Wing; restore: () => Promise<void> }> {
  const before = await apiAsPage<Profile>(page, "GET", "/profile");
  const wings = await apiAsPage<Wing[]>(page, "GET", "/wings");
  const wing = wings.find((w) => w.nameEn.trim() !== "" && w.id !== before.wing?.id);
  if (!wing) throw new Error("no wing with an English name in the database");
  await apiAsPage(page, "PATCH", "/profile", { wingId: wing.id });
  return {
    wing,
    restore: async () => {
      await apiAsPage(page, "PATCH", "/profile", { wingId: before.wing?.id ?? null });
    },
  };
}

test("the organizer is shown as the wing (Bangla and English), not as the person", async ({
  browser,
}) => {
  const page = await pageAs(browser, "so", "bn");
  const { wing, restore } = await giveWing(page);
  const title = uniqueTitle("উইং");
  // Starts one minute ago (allowed: up to 5 min in the past) so it is on today's dashboard.
  const start = new Date(Date.now() - 60_000);
  const meeting = await createMeetingAs(page, {
    title,
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
  });
  try {
    // Dashboard (today): the organizer column shows the wing, not the person.
    await page.goto("/dashboard");
    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toContainText(wing.nameBn);
    await expect(row).not.toContainText(so.nameBn);

    // Detail: "আয়োজক" = the wing; the venue under "স্থান".
    await page.goto(`/meetings/${meeting.id}`);
    const organizerRow = page.locator("dt", { hasText: bn.meetingDetail.organizer }).locator("..");
    await expect(organizerRow).toContainText(wing.nameBn);
    await expect(page.getByText(bn.meetingDetail.room, { exact: true })).toBeVisible();
    await expect(page.getByText("কক্ষ ৫০১", { exact: true })).toBeVisible();

    // English mode: the English wing name.
    const enPage = await pageAs(browser, "so", "en");
    try {
      await enPage.goto(`/meetings/${meeting.id}`);
      const enRow = enPage.locator("dt", { hasText: en.meetingDetail.organizer }).locator("..");
      await expect(enRow).toContainText(wing.nameEn);
      await expect(enRow).not.toContainText(so.nameEn);
      await expect(enPage.getByText(en.meetingDetail.room, { exact: true })).toBeVisible();
    } finally {
      await enPage.context().close();
    }
  } finally {
    await cancelMeetingAs(page, meeting.id).catch(() => undefined);
    await restore();
    await page.context().close();
  }
});

test("the venue is required in the meeting form (with the new hint and message)", async ({
  browser,
}) => {
  const page = await pageAs(browser, "so", "bn");
  try {
    await page.goto("/meetings/new");
    const venue = page.getByLabel(bn.meetingForm.room, { exact: false });
    await expect(venue).toHaveAttribute("placeholder", bn.meetingForm.roomPlaceholder);
    await expect(venue).toHaveAttribute("required", "");

    await page.getByLabel(bn.meetingForm.title).fill(uniqueTitle("স্থান"));
    const day = dhakaDate(6);
    await fillMeetingTime(page, day, "08:00", "08:30");
    await venue.fill("   ");
    await page.getByRole("button", { name: bn.meetingForm.create }).click();
    await expect(page.getByText(bn.meetingForm.roomRequired)).toBeVisible();
    await expect(page).toHaveURL(/\/meetings\/new$/); // nothing saved
  } finally {
    await page.context().close();
  }
});
