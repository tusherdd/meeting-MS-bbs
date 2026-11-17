import { expect, test, type Page } from "@playwright/test";
import {
  cancelLeftovers,
  cancelMeetingAs,
  dhakaDate,
  fillMeetingTime,
  pageAs,
  uniqueTitle,
} from "./support/helpers";
import { OFFICERS } from "./support/officers";

/**
 * v1.5 guest officers (অতিথি কর্মকর্তা, SPEC.md §6.7) in the meeting form: add / remove with
 * inline validation, a guest as chair, the detail page and editing. Day 6 ahead: no clashes
 * with the other suites.
 */
test.describe.configure({ mode: "serial" });

let dd1: Page;
const created: string[] = [];

test.beforeAll(async ({ browser }) => {
  dd1 = await pageAs(browser, "dd1");
  await dd1.goto("/dashboard");
  await cancelLeftovers(dd1);
});

test.afterAll(async () => {
  for (const id of created) await cancelMeetingAs(dd1, id);
  await dd1?.context().close();
});

const section = (page: Page) => page.getByTestId("guest-officers");
const addButton = (page: Page) => section(page).getByRole("button", { name: "যোগ করুন" });
const chairSelect = (page: Page) => page.getByLabel("সভাপতি", { exact: true });

async function fillGuest(page: Page, name: string, designation: string, email: string) {
  await section(page).getByLabel("নাম", { exact: true }).fill(name);
  await section(page).getByLabel("পদবি", { exact: true }).fill(designation);
  await section(page).getByLabel("Email", { exact: true }).fill(email);
}

test("add, validate and remove guests; a guest can chair; detail and edit show them", async () => {
  const title = uniqueTitle("অতিথি");
  await dd1.goto("/meetings/new");
  await dd1.getByLabel("সভার শিরোনাম").fill(title);
  await fillMeetingTime(dd1, dhakaDate(6), "10:00", "11:00");
  await dd1.getByLabel("স্থান", { exact: true }).fill("সম্মেলন কক্ষ"); // v1.9: required

  // The section sits directly above the chair select.
  const order = await dd1.evaluate(() => {
    const guests = document.querySelector('[data-testid="guest-officers"]');
    const chair = document.getElementById("chairId");
    return !!guests && !!chair && !!(guests.compareDocumentPosition(chair) & 4);
  });
  expect(order).toBe(true);

  // Disabled until all three are filled and the email is valid.
  await expect(addButton(dd1)).toBeDisabled();
  await fillGuest(dd1, "ড. ফারহানা ইসলাম", "যুগ্মসচিব, পরিকল্পনা মন্ত্রণালয়", "farhana@");
  await expect(addButton(dd1)).toBeDisabled();
  await section(dd1).getByLabel("নাম", { exact: true }).focus(); // blur the email field
  await expect(section(dd1)).toContainText("সঠিক Email ঠিকানা দিন।");
  await section(dd1).getByLabel("Email", { exact: true }).fill("farhana@guest-e2e.example.org");
  await expect(addButton(dd1)).toBeEnabled();
  await addButton(dd1).click();

  // Fields clear; the list shows name — designation — email.
  await expect(section(dd1).getByLabel("নাম", { exact: true })).toHaveValue("");
  await expect(section(dd1).getByLabel("Email", { exact: true })).toHaveValue("");
  const list = dd1.getByTestId("guest-list");
  await expect(list).toContainText(
    "ড. ফারহানা ইসলাম — যুগ্মসচিব, পরিকল্পনা মন্ত্রণালয় — farhana@guest-e2e.example.org",
  );

  // Duplicate email (any case) → inline error, button disabled. Enter does not submit the form.
  await fillGuest(dd1, "আরেকজন", "পরামর্শক", "FARHANA@guest-e2e.example.org");
  await expect(section(dd1)).toContainText(
    "এই Email দিয়ে একজন অতিথি কর্মকর্তা আগেই যোগ করা হয়েছে।",
  );
  await expect(addButton(dd1)).toBeDisabled();
  await section(dd1).getByLabel("Email", { exact: true }).fill("john@guest-e2e.example.org");
  await section(dd1).getByLabel("Email", { exact: true }).press("Enter");
  await expect(dd1).toHaveURL(/\/meetings\/new$/);
  await expect(list.getByRole("listitem")).toHaveCount(2);

  // Guests appear in the chair select, marked "(অতিথি কর্মকর্তা)".
  await chairSelect(dd1).selectOption({ label: "আরেকজন (অতিথি কর্মকর্তা)" });
  // Removing the guest who chairs clears the chair.
  await list.getByRole("button", { name: "আরেকজন-কে বাদ দিন" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(chairSelect(dd1)).toHaveValue("");

  await chairSelect(dd1).selectOption({ label: "ড. ফারহানা ইসলাম (অতিথি কর্মকর্তা)" });
  await expect(dd1.getByTestId("conflict-panel")).toHaveAttribute("data-state", "ok");
  await dd1.getByRole("button", { name: "সভা তৈরি করুন" }).click();
  await expect(dd1).toHaveURL(/\/meetings\/[0-9a-f-]{36}$/);
  const id = dd1.url().split("/").pop()!;
  created.push(id);

  // Detail: the guest section and the guest chair.
  const guests = dd1.getByTestId("meeting-guests");
  await expect(guests).toContainText("ড. ফারহানা ইসলাম");
  await expect(guests).toContainText(
    "যুগ্মসচিব, পরিকল্পনা মন্ত্রণালয় · farhana@guest-e2e.example.org",
  );
  await expect(guests).toContainText("সভাপতি");
  await expect(
    dd1.getByText("ড. ফারহানা ইসলাম, যুগ্মসচিব, পরিকল্পনা মন্ত্রণালয় (অতিথি কর্মকর্তা)"),
  ).toBeVisible();
  await expect(dd1.getByRole("heading", { name: "অতিথি কর্মকর্তা (১)" })).toBeVisible();

  // Edit: guests are prefilled and editable; removing the guest chair empties the chair.
  await dd1.getByRole("link", { name: "Edit" }).click();
  await expect(dd1).toHaveURL(new RegExp(`/meetings/${id}/edit$`));
  await expect(chairSelect(dd1)).toHaveValue("guest:farhana@guest-e2e.example.org");
  await dd1
    .getByTestId("guest-list")
    .getByRole("button", { name: "ড. ফারহানা ইসলাম-কে বাদ দিন" })
    .click();
  await expect(chairSelect(dd1)).toHaveValue("");
  await fillGuest(dd1, "মিস্টার জন", "Consultant, UNFPA", "john@guest-e2e.example.org");
  await addButton(dd1).click();
  await dd1.getByRole("button", { name: "Save Changes" }).click();
  await expect(dd1).toHaveURL(new RegExp(`/meetings/${id}$`));
  await expect(dd1.getByTestId("meeting-guests")).toContainText("মিস্টার জন");
  await expect(dd1.getByTestId("meeting-guests")).not.toContainText("ফারহানা");
});

test("an officer's email cannot be a guest: the backend message is shown", async () => {
  await dd1.goto("/meetings/new");
  await dd1.getByLabel("সভার শিরোনাম").fill(uniqueTitle("অতিথি কর্মকর্তা"));
  await fillMeetingTime(dd1, dhakaDate(6), "12:00", "13:00");
  await dd1.getByLabel("স্থান", { exact: true }).fill("অনলাইন");
  await fillGuest(dd1, "নাম", "পদবি", OFFICERS.so.loginEmail);
  await addButton(dd1).click();
  await dd1.getByRole("button", { name: "সভা তৈরি করুন" }).click();
  await expect(dd1.getByRole("alert").filter({ hasText: OFFICERS.so.nameBn })).toContainText(
    "অংশগ্রহণকারী তালিকা থেকে নির্বাচন করুন",
  );
  await expect(dd1).toHaveURL(/\/meetings\/new$/);
});
