import { expect, test } from "@playwright/test";
import { bn } from "../messages/bn";
import {
  apiAsPage,
  cancelMeetingAs,
  dhakaDate,
  dhakaIso,
  pageAs,
  uniqueTitle,
  type MeetingDetail,
} from "./support/helpers";

/**
 * v1.19 (SPEC.md §6.9, §13.6, §13.19): minutes required yes / no per meeting.
 * - the form has the checkbox "এই সভার কার্যবিবরণী আপলোড করতে হবে", checked by default, no required mark;
 * - the detail page shows "এই সভার কার্যবিবরণী প্রয়োজন নেই।" when not required and no file;
 * - the edit form shows the stored value and saves a change.
 */
test("create form: checkbox checked by default, no required mark", async ({ browser }) => {
  const page = await pageAs(browser, "dd1");
  try {
    await page.goto("/meetings/new");
    const box = page.getByLabel(bn.meetingForm.minutesRequired, { exact: true });
    await expect(box).toBeVisible();
    await expect(box).toBeChecked();
    await expect(box).not.toHaveAttribute("aria-required", "true");
    await expect(page.locator('label:has(#minutesRequired) [data-required-mark]')).toHaveCount(0);
  } finally {
    await page.context().close();
  }
});

test("not required: muted line on the detail page; edit shows and saves the value", async ({
  browser,
}) => {
  const page = await pageAs(browser, "dd1");
  const day = dhakaDate(6);
  const meeting = await apiAsPage<MeetingDetail>(page, "POST", "/meetings", {
    title: uniqueTitle("কার্যবিবরণী বাদ"),
    startAt: dhakaIso(day, "09:00"),
    endAt: dhakaIso(day, "09:45"),
    room: "কক্ষ ৫০১",
    minutesRequired: false,
  });
  try {
    expect(meeting.minutesRequired).toBe(false);
    await page.goto(`/meetings/${meeting.id}`);
    await expect(page.getByTestId("minutes-not-required")).toHaveText(bn.decisions.notRequired);

    await page.goto(`/meetings/${meeting.id}/edit`);
    const box = page.getByLabel(bn.meetingForm.minutesRequired, { exact: true });
    await expect(box).not.toBeChecked();
    await box.check();
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/meetings/${meeting.id}$`));
    await expect(page.getByTestId("minutes-not-required")).toHaveCount(0);
    const saved = await apiAsPage<MeetingDetail>(page, "GET", `/meetings/${meeting.id}`);
    expect(saved.minutesRequired).toBe(true);
  } finally {
    await cancelMeetingAs(page, meeting.id);
    await page.context().close();
  }
});
