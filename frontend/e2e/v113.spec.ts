import { expect, test, type Page } from "@playwright/test";
import { bn } from "../messages/bn";
import { tinyDocx } from "./support/docx";
import {
  addParticipant,
  cancelMeetingAs,
  dhakaDate,
  fillMeetingTime,
  pageAs,
  uniqueTitle,
} from "./support/helpers";

/**
 * v1.13 (SPEC.md §6.8, §13.6, §13.18): the uploaded meeting notice "সভার নোটিশ".
 * The organizer (dd1) creates a meeting with the form and attaches a DOCX notice; a member (so)
 * downloads it from the three-dot row menu ("সভার নোটিশ" appears only because a file exists).
 * A DOCX is always a download (never opened in the browser). One far-away day, so no other
 * test meeting is in the way.
 */
const DOCX_NAME = "sova-notice.docx";

async function openRowMenu(page: Page, date: string, title: string) {
  await page.goto(`/reports?period=day&date=${date}`);
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: bn.rowMenu.button }).click();
  await expect(page.getByRole("menu", { name: bn.rowMenu.button })).toBeVisible();
}

test("the organizer creates a meeting with a notice; a member downloads it from the row menu", async ({
  browser,
}) => {
  const org = await pageAs(browser, "dd1");
  const member = await pageAs(browser, "so");
  const date = dhakaDate(53);
  const title = uniqueTitle("নোটিশ");
  let id: string | null = null;

  try {
    await org.goto("/meetings/new");
    await org.getByLabel("সভার শিরোনাম").fill(title);
    await fillMeetingTime(org, date, "08:10", "08:40");
    await org.getByLabel("স্থান", { exact: true }).fill("সম্মেলন কক্ষ");
    await addParticipant(org, "so");

    // The field: label and hint as decided, never "optional".
    const field = org.getByTestId("notice-field");
    await expect(field).toContainText(bn.notice.label);
    await expect(field).toContainText(bn.notice.hint);
    await expect(field).not.toContainText("ঐচ্ছিক");
    await org.getByLabel(bn.notice.label).setInputFiles({
      name: DOCX_NAME,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: tinyDocx(),
    });

    await org.getByRole("button", { name: bn.meetingForm.create }).click();
    await expect(org).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/);
    id = org.url().split("/").pop()!;
    await expect(org.getByText(bn.meetingForm.created)).toBeVisible();

    // The edit page shows the current file with Replace and Remove.
    await org.goto(`/meetings/${id}/edit`);
    await expect(org.getByTestId("notice-field")).toContainText(DOCX_NAME);
    await expect(org.getByRole("button", { name: bn.notice.replace })).toBeVisible();
    await expect(org.getByRole("button", { name: bn.notice.remove })).toBeVisible();

    // The member: "সভার নোটিশ" in the row menu → the DOCX is downloaded.
    await openRowMenu(member, date, title);
    const items = (await member.getByRole("menuitem").allInnerTexts()).map((s) => s.trim());
    expect(items).toEqual([bn.rowMenu.view, bn.rowMenu.notice]);
    const download = member.waitForEvent("download");
    await member.getByRole("menuitem", { name: bn.rowMenu.notice }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(DOCX_NAME);
  } finally {
    if (id) await cancelMeetingAs(org, id);
    await Promise.all([org, member].map((p) => p.context().close()));
  }
});
