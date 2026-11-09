import { expect, test, type Page } from "@playwright/test";
import { formatInTimeZone } from "date-fns-tz";
import {
  DHAKA,
  addParticipant,
  cancelLeftovers,
  cancelMeetingAs,
  createMeetingAs,
  dhakaDate,
  dhakaIso,
  fillMeetingTime,
  nameOf,
  pageAs,
  uniqueTitle,
} from "./support/helpers";

/**
 * F2: meetings, live conflict check, conflicts and notifications — only with the dedicated test
 * officers (dd1, dd2 = Deputy Director 6; dg = Director General 2; so = Statistical Officer 7).
 * Clash tests use days 2–4 ahead so they never touch today's or each other's meetings.
 */
test.describe.configure({ mode: "serial" });

let dd1: Page;
let dd2: Page;
let dg: Page;
let so: Page;
const created: { page: () => Page; id: string }[] = [];

test.beforeAll(async ({ browser }) => {
  [dd1, dd2, dg, so] = await Promise.all([
    pageAs(browser, "dd1"),
    pageAs(browser, "dd2"),
    pageAs(browser, "dg"),
    pageAs(browser, "so"),
  ]);
  for (const page of [dd1, dd2, dg, so]) {
    await page.goto("/dashboard");
    await cancelLeftovers(page);
  }
});

test.afterAll(async () => {
  for (const m of created) await cancelMeetingAs(m.page(), m.id);
  await Promise.all([dd1, dd2, dg, so].map((p) => p?.context().close()));
});

function meetingIdFrom(page: Page): string {
  const match = page.url().match(/\/meetings\/([0-9a-f-]{36})$/);
  if (!match) throw new Error(`Not on a meeting page: ${page.url()}`);
  return match[1];
}

const panel = (page: Page) => page.getByTestId("conflict-panel");
const submit = (page: Page) => page.getByRole("button", { name: "সভা তৈরি করুন" });

test("create a meeting with the form; it shows on the dashboard, calendar and list", async () => {
  // Today, starting in ~15 minutes (rounded to 5), 30 minutes long.
  const start = new Date(Math.ceil((Date.now() + 15 * 60_000) / 300_000) * 300_000);
  const end = new Date(start.getTime() + 30 * 60_000);
  test.skip(dhakaDate(0, end) !== dhakaDate(0), "too close to midnight in Dhaka");
  const time = (d: Date) => formatInTimeZone(d, DHAKA, "HH:mm");
  const title = uniqueTitle("ফর্ম");

  await dd1.goto("/dashboard");
  await dd1.getByRole("link", { name: "নতুন সভা" }).first().click();
  await expect(dd1).toHaveURL(/\/meetings\/new$/);
  await expect(dd1.getByTestId("meeting-priority")).toHaveText(
    "আপনার সভার অগ্রাধিকার: ৬ (উপপরিচালক)",
  );

  await dd1.getByLabel("সভার শিরোনাম").fill(title);
  await fillMeetingTime(dd1, dhakaDate(0), time(start), time(end));
  await dd1.getByLabel("কক্ষ", { exact: true }).fill("সম্মেলন কক্ষ");
  await addParticipant(dd1, "so");
  await expect(panel(dd1)).toHaveAttribute("data-state", "ok");
  await expect(panel(dd1)).toContainText("কোনো সংঘাত নেই");

  await submit(dd1).click();
  await expect(dd1).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/);
  const id = meetingIdFrom(dd1);
  created.push({ page: () => dd1, id });
  await expect(dd1.getByText("সভা তৈরি হয়েছে।")).toBeVisible();
  await expect(dd1.getByRole("heading", { name: title })).toBeVisible();
  await expect(dd1.getByTestId("meeting-people")).toContainText(nameOf("so"));

  await dd1.goto("/dashboard");
  await expect(dd1.getByRole("row").filter({ hasText: title })).toBeVisible();

  await dd1.goto("/calendar");
  await expect(
    dd1.getByTestId("calendar-meeting").filter({ hasText: title, visible: true }),
  ).toBeVisible();

  await dd1.goto("/meetings");
  await expect(dd1.getByRole("row").filter({ hasText: title })).toBeVisible();
});

test("equal priority clash: red panel, submit disabled; a touching slot turns it green", async () => {
  const day = dhakaDate(2);
  const other = await createMeetingAs(dd2, {
    title: uniqueTitle("সমান"),
    startAt: dhakaIso(day, "10:00"),
    endAt: dhakaIso(day, "11:00"),
  });
  created.push({ page: () => dd2, id: other.id });

  await dd1.goto("/meetings/new");
  await dd1.getByLabel("সভার শিরোনাম").fill(uniqueTitle("সংঘাত"));
  await fillMeetingTime(dd1, day, "10:30", "11:30");
  await addParticipant(dd1, "dd2");

  await expect(panel(dd1)).toHaveAttribute("data-state", "blocked");
  await expect(panel(dd1)).toContainText("এই সময়ে সভা তৈরি করা যাবে না");
  await expect(panel(dd1)).toContainText("অন্য একটি সভা"); // not my meeting: title hidden
  await expect(panel(dd1)).toContainText(nameOf("dd2"));
  await expect(submit(dd1)).toBeDisabled();
  await expect(dd1.locator("[data-clash]")).toContainText(nameOf("dd2"));

  // 11:00–12:00 only touches 10:00–11:00 → no clash.
  await fillMeetingTime(dd1, day, "11:00", "12:00");
  await expect(panel(dd1)).toHaveAttribute("data-state", "ok");
  await expect(panel(dd1)).toContainText("কোনো সংঘাত নেই");
  await expect(submit(dd1)).toBeEnabled();
  await expect(dd1.locator("[data-clash]")).toHaveCount(0);
});

test("higher priority overrides lower: amber panel, save, lower organizer is notified and cancels", async () => {
  const day = dhakaDate(3);
  const lowTitle = uniqueTitle("নিম্ন");
  const low = await createMeetingAs(dd2, {
    title: lowTitle,
    startAt: dhakaIso(day, "14:00"),
    endAt: dhakaIso(day, "15:00"),
  });
  created.push({ page: () => dd2, id: low.id });

  // Director General books the same hour with dd2.
  const highTitle = uniqueTitle("উচ্চ");
  await dg.goto("/meetings/new");
  await expect(dg.getByTestId("meeting-priority")).toContainText("২ (মহাপরিচালক)");
  await dg.getByLabel("সভার শিরোনাম").fill(highTitle);
  await fillMeetingTime(dg, day, "14:00", "15:00");
  await addParticipant(dg, "dd2");
  await expect(panel(dg)).toHaveAttribute("data-state", "warn");
  await expect(panel(dg)).toContainText(
    "এই সভা তৈরি হলে নিচের সভাগুলোর আয়োজকদের কাছে বাতিল/পুনর্নির্ধারণের অনুরোধ যাবে",
  );
  await expect(panel(dg)).toContainText("উপপরিচালক"); // organizer designation of the lower one
  await submit(dg).click();
  await expect(dg).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/);
  created.push({ page: () => dg, id: meetingIdFrom(dg) });

  // The lower organizer sees the notification …
  await dd2.goto("/notifications");
  await expect(dd2.getByTestId("notification-list")).toContainText(
    `সময় সংঘাত: আপনার সভা “${lowTitle}”`,
  );

  // … and the conflict, and cancels the lower meeting from there.
  await dd2.goto("/conflicts");
  const item = dd2.getByTestId("conflict-item").filter({ hasText: lowTitle });
  await expect(item).toBeVisible();
  await expect(item).toContainText(highTitle); // dd2 is invited to the higher meeting
  await item.getByRole("button", { name: "সভা বাতিল করুন" }).click();
  const dialog = dd2.getByRole("dialog");
  await dialog.getByLabel("বাতিলের কারণ").fill("মহাপরিচালকের সভার কারণে স্থগিত");
  await dialog.getByRole("button", { name: "সভা বাতিল করুন" }).click();
  await expect(dd2.getByText("সভা বাতিল করা হয়েছে।")).toBeVisible();
  await expect(dd2.getByTestId("conflict-item").filter({ hasText: lowTitle })).toHaveCount(0);

  await dd2.getByRole("tab", { name: "মীমাংসিত" }).click();
  const resolved = dd2.getByTestId("conflict-item").filter({ hasText: lowTitle });
  await expect(resolved).toBeVisible();
  await expect(resolved).toContainText("মীমাংসিত");
});

test("an outsider opening a meeting URL sees “সভাটি পাওয়া যায়নি”", async () => {
  const day = dhakaDate(4);
  const meeting = await createMeetingAs(dd1, {
    title: uniqueTitle("গোপন"),
    startAt: dhakaIso(day, "09:00"),
    endAt: dhakaIso(day, "10:00"),
  });
  created.push({ page: () => dd1, id: meeting.id });

  await so.goto(`/meetings/${meeting.id}`);
  await expect(so.getByRole("heading", { name: "সভাটি পাওয়া যায়নি" })).toBeVisible();
  await expect(so.getByText(meeting.title)).toHaveCount(0);

  await so.goto(`/meetings/${meeting.id}/edit`);
  await expect(so.getByRole("heading", { name: "সভাটি পাওয়া যায়নি" })).toBeVisible();
});
