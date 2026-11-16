import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { bn } from "../messages/bn";
import { en } from "../messages/en";
import { langCookie, type OfficerKey, type UiLang } from "../e2e/support/officers";
import {
  cancelMeetingAs,
  createMeetingAs,
  dhakaDate,
  dhakaIso,
  pageAs,
  uniqueTitle,
} from "../e2e/support/helpers";

/** Review screenshots: every key page, English and Bangla, desktop and mobile. */
const LABEL = process.env.SHOTS ?? "shots";
const OUT = join(__dirname, "..", "screenshots", LABEL);
const SIZES = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const DAY = dhakaDate(9); // far enough from the other tests' days

let meetingId = "";

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(400);
}

async function open(
  browser: Browser,
  who: OfficerKey | null,
  lang: UiLang,
  size: keyof typeof SIZES,
): Promise<Page> {
  if (who) {
    const page = await pageAs(browser, who, lang);
    await page.setViewportSize(SIZES[size]);
    return page;
  }
  const context = await browser.newContext({
    viewport: SIZES[size],
    storageState: { cookies: [langCookie(lang)], origins: [] },
  });
  return context.newPage();
}

async function shot(page: Page, name: string, lang: UiLang, size: string, browserName: string) {
  await settle(page);
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({
    path: join(OUT, `${browserName}-${size}-${lang}-${name}.png`),
    fullPage: true,
  });
}

test.beforeAll(async ({ browser }) => {
  const dd1 = await pageAs(browser, "dd1");
  try {
    const m = await createMeetingAs(dd1, {
      title: uniqueTitle("স্ক্রিনশট"),
      startAt: dhakaIso(DAY, "10:00"),
      endAt: dhakaIso(DAY, "11:00"),
    });
    meetingId = m.id;
  } finally {
    await dd1.context().close();
  }
});

test.afterAll(async ({ browser }) => {
  const dd1 = await pageAs(browser, "dd1");
  try {
    if (meetingId) await cancelMeetingAs(dd1, meetingId);
  } finally {
    await dd1.context().close();
  }
});

for (const lang of ["en", "bn"] as const) {
  const t = lang === "en" ? en : bn;
  for (const size of ["desktop", "mobile"] as const) {
    test(`${lang} ${size}`, async ({ browser, browserName }) => {
      const save = (page: Page, name: string) => shot(page, name, lang, size, browserName);

      const login = await open(browser, null, lang, size);
      await login.goto("/login");
      await save(login, "01-login");
      await login.context().close();

      const dd1 = await open(browser, "dd1", lang, size);
      await dd1.goto("/dashboard");
      await save(dd1, "02-dashboard");
      await dd1.goto("/meetings");
      await save(dd1, "03-meetings");

      // New meeting at the time of dd1's own meeting → red conflict panel; one guest added.
      await dd1.goto("/meetings/new");
      await dd1.getByLabel(t.meetingForm.title, { exact: true }).fill("Screenshot meeting");
      await dd1.getByLabel(t.meetingForm.date, { exact: true }).fill(DAY);
      await dd1.getByLabel(t.meetingForm.startTime, { exact: true }).fill("10:30");
      await dd1.getByLabel(t.meetingForm.endTime, { exact: true }).fill("11:30");
      const guests = dd1.getByTestId("guest-officers");
      await guests.getByLabel(t.meetingForm.guestName, { exact: true }).fill("Dr. Farhana Islam");
      await guests
        .getByLabel(t.meetingForm.guestDesignation, { exact: true })
        .fill("Joint Secretary");
      await guests
        .getByLabel(t.meetingForm.guestEmail, { exact: true })
        .fill("farhana@guest-shots.example.org");
      await guests.getByRole("button", { name: t.meetingForm.guestAdd, exact: true }).click();
      await expect(dd1.getByTestId("conflict-panel")).toHaveAttribute("data-state", "blocked");
      await save(dd1, "04-new-meeting");

      await dd1.goto(`/meetings/${meetingId}`);
      await save(dd1, "05-meeting-detail");
      await dd1.goto("/conflicts");
      await save(dd1, "06-duplicate-meetings");
      await dd1.goto("/profile");
      await save(dd1, "07-profile");
      await dd1.context().close();

      const admin = await open(browser, "admin", lang, size);
      await admin.goto("/admin/users");
      await save(admin, "08-admin-officers");
      await admin.goto("/admin/designations");
      await save(admin, "09-admin-designations");
      await admin.context().close();
    });
  }
}
