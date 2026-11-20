import { expect, test } from "@playwright/test";
import {
  apiAsPage,
  cancelLeftovers,
  cancelMeetingAs,
  createMeetingAs,
  dhakaDate,
  pageAs,
  uniqueTitle,
} from "./support/helpers";

test("dashboard lists today's meeting created through the API", async ({ browser }) => {
  const page = await pageAs(browser, "officer");
  await page.goto("/dashboard");
  await cancelLeftovers(page); // earlier runs: same officer, same time → 409

  // Starts one minute ago (allowed: up to 5 min in the past) so it is "today" even near midnight.
  const title = uniqueTitle("Dashboard");
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
    await page.getByRole("button", { name: "মেনু", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "মেনু" });
    await drawer.getByRole("link", { name: "ডুপ্লিকেট সভা" }).click();
    await expect(page).toHaveURL(/\/conflicts$/);
  } finally {
    await cancelMeetingAs(page, meeting.id);
    await page.context().close();
  }
});

/**
 * v1.15 (SPEC.md §13.20): the status filter under the period tabs — "চলমান" by default, each
 * button, and its combination with the period tabs (the filter is kept when the tab changes).
 */
test("dashboard status filter: default চলমান, each button, kept across the period tabs", async ({
  browser,
}) => {
  const now = Date.now();
  const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  // All three meetings must fall on today (Dhaka) — skip the last 40 minutes before midnight.
  test.skip(
    dhakaDate(0, new Date(now + 40 * 60_000)) !== dhakaDate(0, new Date(now)),
    "too close to midnight in Dhaka",
  );

  const page = await pageAs(browser, "officer");
  await page.goto("/dashboard");
  await cancelLeftovers(page);

  const done = await createMeetingAs(page, {
    title: uniqueTitle("Filter done"),
    startAt: at(-2), // started (completing needs the start), allowed up to 5 min in the past
    endAt: at(8),
  });
  const open = await createMeetingAs(page, {
    title: uniqueTitle("Filter open"),
    startAt: at(10),
    endAt: at(20),
  });
  const gone = await createMeetingAs(page, {
    title: uniqueTitle("Filter gone"),
    startAt: at(25),
    endAt: at(35),
  });

  try {
    await apiAsPage(page, "POST", `/meetings/${done.id}/complete`, { notes: null });
    await cancelMeetingAs(page, gone.id);
    await page.reload();

    const filter = page.getByRole("group", { name: "সভার অবস্থা" });
    const button = (name: string) => filter.getByRole("button", { name, exact: true });
    const row = (title: string) => page.getByRole("row").filter({ hasText: title });
    const expectRows = async (shown: string[], hidden: string[]) => {
      for (const title of shown) await expect(row(title)).toBeVisible();
      for (const title of hidden) await expect(row(title)).toHaveCount(0);
    };

    // Order, no counts, default "চলমান".
    await expect(filter.getByRole("button")).toHaveText(["সকল", "চলমান", "সম্পন্ন"]);
    await expect(button("চলমান")).toHaveAttribute("aria-pressed", "true");
    await expect(button("সকল")).toHaveAttribute("aria-pressed", "false");
    await expectRows([open.title], [done.title, gone.title]);

    await button("সম্পন্ন").click();
    await expect(button("সম্পন্ন")).toHaveAttribute("aria-pressed", "true");
    await expect(button("চলমান")).toHaveAttribute("aria-pressed", "false");
    await expectRows([done.title], [open.title, gone.title]);

    await button("সকল").click();
    await expectRows([done.title, open.title, gone.title], []);

    // Combination with the period tabs: the chosen filter stays.
    await button("সম্পন্ন").click();
    await page.getByRole("tab", { name: "এই সপ্তাহ" }).click();
    await expect(button("সম্পন্ন")).toHaveAttribute("aria-pressed", "true");
    await expectRows([done.title], [open.title, gone.title]);

    await button("চলমান").click();
    await page.getByRole("tab", { name: "এই মাস" }).click();
    await expect(button("চলমান")).toHaveAttribute("aria-pressed", "true");
    await expectRows([open.title], [done.title, gone.title]);

    await page.getByRole("tab", { name: "আজ" }).click();
    await expect(button("চলমান")).toHaveAttribute("aria-pressed", "true");
    await expectRows([open.title], [done.title, gone.title]);
  } finally {
    await cancelMeetingAs(page, open.id);
    await cancelMeetingAs(page, gone.id);
    await page.context().close();
  }
});
