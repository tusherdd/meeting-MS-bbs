import { expect, test } from "@playwright/test";
import {
  cancelLeftovers,
  cancelMeetingAs,
  createMeetingAs,
  pageAs,
  uniqueTitle,
} from "./support/helpers";

test("dashboard lists today's meeting created through the API", async ({ browser }) => {
  const page = await pageAs(browser, "officer");
  await page.goto("/dashboard");
  await cancelLeftovers(page); // earlier runs: same officer, same time → 409

  // Starts one minute ago (allowed: up to 5 min in the past) so it is "today" even near midnight.
  const title = uniqueTitle("ড্যাশবোর্ড");
  const start = new Date(Date.now() - 60_000);
  const meeting = await createMeetingAs(page, {
    title,
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
  });

  try {
    await page.reload();
    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible();
    await expect(row).toContainText("কক্ষ ৫০১");
    await expect(row).toContainText("আয়োজক"); // my role
    await expect(row).toContainText("নির্ধারিত"); // status SCHEDULED
    // Times are shown with Bangla digits (the browser runs in UTC; the UI shows Dhaka time).
    await expect(row.getByRole("cell").first()).toHaveText(/[০-৯]+:[০-৯]{2}/);

    // The other tabs load too.
    await page.getByRole("tab", { name: "এই সপ্তাহ" }).click();
    await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();
    await page.getByRole("tab", { name: "এই মাস" }).click();
    await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();

    // Phone width: the sidebar becomes a menu button with a drawer.
    await page.setViewportSize({ width: 390, height: 800 });
    await page.getByRole("button", { name: "মেনু খুলুন" }).click();
    const drawer = page.getByRole("dialog", { name: "মেনু" });
    await drawer.getByRole("link", { name: "সংঘাত" }).click();
    await expect(page).toHaveURL(/\/conflicts$/);
  } finally {
    await cancelMeetingAs(page, meeting.id);
    await page.context().close();
  }
});
