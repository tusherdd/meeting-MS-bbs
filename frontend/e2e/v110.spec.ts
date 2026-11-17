import { expect, test, type Page } from "@playwright/test";
import { bn } from "../messages/bn";
import {
  apiAsPage,
  cancelMeetingAs,
  dhakaDate,
  dhakaIso,
  pageAs,
  uniqueTitle,
  userIdOf,
  type MeetingDetail,
} from "./support/helpers";

/**
 * v1.10 (SPEC.md §13.18, §6.8): the three-dot "আরও অপশন" menu at the end of meeting rows.
 * - organizer (dd1) and internal chair (dd2): View details, Export PDF, Edit, Cancel;
 * - plain member (so): View details, Export PDF;
 * - keyboard: arrows move, Escape closes and returns focus; a click outside closes;
 * - Export PDF downloads "meeting-notice-YYYY-MM-DD-<shortid>.pdf";
 * - the chair can open Edit and cancel the meeting from the menu.
 * Uses the personal report page of one far-away day, so no other test meeting is in the way.
 */
const ALL = [bn.rowMenu.view, bn.rowMenu.exportPdf, bn.rowMenu.edit, bn.rowMenu.cancel];
const READ_ONLY = [bn.rowMenu.view, bn.rowMenu.exportPdf];

async function openRowMenu(page: Page, date: string, title: string) {
  await page.goto(`/reports?period=day&date=${date}`);
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toBeVisible();
  const button = row.getByRole("button", { name: bn.rowMenu.button });
  await expect(button).toHaveAttribute("aria-haspopup", "menu");
  await button.click();
  const menu = page.getByRole("menu", { name: bn.rowMenu.button });
  await expect(menu).toBeVisible();
  return { button, menu };
}

async function itemsOf(page: Page): Promise<string[]> {
  return (await page.getByRole("menuitem").allInnerTexts()).map((s) => s.trim());
}

test("row menu items per role, keyboard, Export PDF and the chair's Edit / Cancel", async ({
  browser,
}) => {
  const org = await pageAs(browser, "dd1");
  const chair = await pageAs(browser, "dd2");
  const member = await pageAs(browser, "so");
  const date = dhakaDate(47);
  const title = uniqueTitle("অপশন মেনু");
  const meeting = await apiAsPage<MeetingDetail>(org, "POST", "/meetings", {
    title,
    startAt: dhakaIso(date, "07:10"),
    endAt: dhakaIso(date, "07:40"),
    room: "কক্ষ ৫০১",
    chairId: await userIdOf(chair),
    participantIds: [await userIdOf(member)],
  });

  try {
    // Organizer: all four items.
    await openRowMenu(org, date, title);
    expect(await itemsOf(org)).toEqual(ALL);

    // Plain member: only View details and Export PDF; keyboard and outside click.
    const { button } = await openRowMenu(member, date, title);
    expect(await itemsOf(member)).toEqual(READ_ONLY);
    await expect(member.getByRole("menuitem", { name: bn.rowMenu.view })).toBeFocused();
    await member.keyboard.press("ArrowDown");
    await expect(member.getByRole("menuitem", { name: bn.rowMenu.exportPdf })).toBeFocused();
    await member.keyboard.press("ArrowDown"); // wraps around
    await expect(member.getByRole("menuitem", { name: bn.rowMenu.view })).toBeFocused();
    await member.keyboard.press("Escape");
    await expect(member.getByRole("menu")).toHaveCount(0);
    await expect(button).toBeFocused();
    await button.click();
    await expect(member.getByRole("menu")).toBeVisible();
    await member.mouse.click(5, 5);
    await expect(member.getByRole("menu")).toHaveCount(0);

    // Export PDF downloads the notice.
    await button.click();
    const download = member.waitForEvent("download");
    await member.getByRole("menuitem", { name: bn.rowMenu.exportPdf }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(
      `meeting-notice-${date}-${meeting.id.slice(0, 8)}.pdf`,
    );

    // Internal chair: all four items; Edit opens the form.
    await openRowMenu(chair, date, title);
    expect(await itemsOf(chair)).toEqual(ALL);
    await chair.getByRole("menuitem", { name: bn.rowMenu.edit }).click();
    await expect(chair).toHaveURL(new RegExp(`/meetings/${meeting.id}/edit$`));
    await expect(chair.getByRole("heading", { name: bn.meetingForm.editTitle })).toBeVisible();
    await expect(chair.getByText(bn.meetingForm.cannotEditEnded)).toHaveCount(0);

    // The chair cancels from the menu; afterwards the row offers no Export / Edit / Cancel.
    await openRowMenu(chair, date, title);
    await chair.getByRole("menuitem", { name: bn.rowMenu.cancel }).click();
    const dialog = chair.getByRole("dialog");
    await dialog.getByLabel(bn.meetingDetail.cancelReasonLabel).fill("সভাপতির সিদ্ধান্ত");
    await dialog.getByRole("button", { name: bn.meetingDetail.confirmCancel }).click();
    await expect(chair.getByText(bn.meetingDetail.cancelled)).toBeVisible();
    await openRowMenu(chair, date, title);
    expect(await itemsOf(chair)).toEqual([bn.rowMenu.view]);
  } finally {
    await cancelMeetingAs(org, meeting.id);
    await Promise.all([org, chair, member].map((p) => p.context().close()));
  }
});
