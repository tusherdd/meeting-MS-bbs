import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cancelMeetingAs, createMeetingAs, dhakaDate, dhakaIso, pageAs } from "./support/helpers";
import { TEST_MEETING_PREFIX } from "./support/officers";

/**
 * Digit rule (SPEC.md §13.11): numbers the system generates (dates, times, counts) are shown in
 * Bangla digits; text typed by users (title, room) is shown exactly as typed.
 */
test("user text keeps its digits; system dates and counts use Bangla digits", async ({
  browser,
}) => {
  const page = await pageAs(browser, "so");
  const title = `${TEST_MEETING_PREFIX} Review v2.1 ${Date.now().toString(36)} 2026`;
  const room = "Conference Room 501";
  const date = dhakaDate(9);
  let id: string | undefined;
  try {
    await page.goto("/dashboard");
    const meeting = await createMeetingAs(page, {
      title,
      startAt: dhakaIso(date, "06:00"),
      endAt: dhakaIso(date, "06:30"),
    });
    id = meeting.id;
    await page.request.fetch(`/api/v1/meetings/${id}`, {
      method: "PATCH",
      data: { room },
      headers: { Origin: "http://localhost:3000" },
    });

    // Detail page: title and room as typed, the time in Bangla digits.
    await page.goto(`/meetings/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByText(room, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("৬:০০ পূর্বাহ্ণ – ৬:৩০ পূর্বাহ্ণ")).toBeVisible();
    await expect(page.getByText("v২.১")).toHaveCount(0);

    // List: the same title; the total count is a system number.
    await page.goto("/meetings");
    await page.getByLabel("শুরুর তারিখ").fill(date);
    await page.getByLabel("শেষ তারিখ").fill(date);
    await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
    await expect(page.getByText(/^মোট [০-৯]+টি সভা$/)).toBeVisible();

    // Report page and its PDF file name; the PDF itself is checked in the backend tests.
    await page.goto(`/reports?period=day&date=${date}`);
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await expect(page.getByText(room, { exact: true }).first()).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF ডাউনলোড" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`meeting-report-${date}.pdf`);
    expect(
      readFileSync(await download.path())
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
  } finally {
    if (id) await cancelMeetingAs(page, id);
    await page.context().close();
  }
});
