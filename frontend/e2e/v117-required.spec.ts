import { expect, test, type Locator, type Page } from "@playwright/test";
import { bn } from "../messages/bn";
import { pageAs } from "./support/helpers";

/**
 * v1.17 part 3 (SPEC.md §13.6a): every required field shows a red "*" and "আবশ্যক" next to its
 * label (shared FieldLabel), the control has aria-required, both marks are aria-hidden and the
 * field's accessible name stays the label text. Optional fields show nothing extra and no
 * "ঐচ্ছিক" text appears anywhere. Exception (§13.6a): the optional sub-sections "অতিথি কর্মকর্তা"
 * and "অন্যান্য সংযুক্তি" show no mark, but their Add buttons keep their rules.
 */
function labelRow(page: Page, controlId: string): Locator {
  return page.locator(`label[for="${controlId}"]`).locator("xpath=..");
}

async function expectRequired(page: Page, controlId: string) {
  const row = labelRow(page, controlId);
  const mark = row.locator("[data-required-mark]");
  await expect(mark).toBeVisible();
  await expect(mark).toContainText("*");
  await expect(mark).toContainText(bn.common.required);
  await expect(mark.locator('[aria-hidden="true"]')).toHaveCount(2);
  await expect(page.locator(`[id="${controlId}"]`)).toHaveAttribute("aria-required", "true");
}

async function expectNotRequired(page: Page, controlId: string) {
  await expect(labelRow(page, controlId).locator("[data-required-mark]")).toHaveCount(0);
  await expect(page.locator(`[id="${controlId}"]`)).not.toHaveAttribute("aria-required", "true");
}

test("login form: both fields required, name stays the label", async ({ page }) => {
  await page.goto("/login");
  await expectRequired(page, "loginEmail");
  await expectRequired(page, "password");
  await expect(page.getByLabel(bn.auth.loginEmail, { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("ঐচ্ছিক");
});

test("meeting form: required and optional fields, guests and attachments", async ({ browser }) => {
  const page = await pageAs(browser, "dd1");
  try {
    await page.goto("/meetings/new");
    for (const id of ["title", "date", "startTime", "endTime", "room"]) {
      await expectRequired(page, id);
    }
    for (const id of ["agenda", "onlineLink"]) await expectNotRequired(page, id);
    // Optional sub-sections (§13.6a exception): guests and other attachments show no mark.
    for (const id of ["guest-name", "guest-designation", "guest-email"]) {
      await expectNotRequired(page, id);
    }
    const attachments = page.getByTestId("attachments-field");
    await expect(attachments.locator("[data-required-mark]")).toHaveCount(0);
    await expect(attachments.locator('input[type="file"]')).not.toHaveAttribute(
      "aria-required",
      "true",
    );
    // Behaviour unchanged: "যোগ করুন" stays disabled until all three guest fields are valid, and
    // an invalid email still shows its inline error.
    const guests = page.getByTestId("guest-officers");
    const addGuest = guests.getByRole("button", { name: bn.meetingForm.guestAdd });
    await expect(addGuest).toBeDisabled();
    await page.locator("#guest-name").fill("জনাব অতিথি");
    await page.locator("#guest-designation").fill("পরিচালক");
    await page.locator("#guest-email").fill("not-an-email");
    await page.locator("#guest-email").blur();
    await expect(addGuest).toBeDisabled();
    await expect(guests).toContainText(bn.meetingForm.guestEmailInvalid);
    await page.locator("#guest-email").fill("guest@example.gov.bd");
    await expect(addGuest).toBeEnabled();
    await expect(attachments.getByRole("button", { name: bn.attachments.add })).toBeDisabled();
    // The notice is not required and shows nothing extra.
    await expect(page.getByTestId("notice-field").locator("[data-required-mark]")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("ঐচ্ছিক");
    await expect(page.locator("main")).not.toContainText(`(${bn.common.required})`);
  } finally {
    await page.context().close();
  }
});
