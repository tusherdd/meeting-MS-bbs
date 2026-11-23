import { expect, test, type Locator, type Page } from "@playwright/test";
import { bn } from "../messages/bn";
import { pageAs } from "./support/helpers";

/**
 * v1.17 part 3 (SPEC.md §13.6a): every required field shows a red "*" and "আবশ্যক" next to its
 * label (shared FieldLabel), the control has aria-required, both marks are aria-hidden and the
 * field's accessible name stays the label text. Optional fields show nothing extra and no
 * "ঐচ্ছিক" text appears anywhere.
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
    // Conditionally required: a guest needs all three fields.
    for (const id of ["guest-name", "guest-designation", "guest-email"]) {
      await expectRequired(page, id);
    }
    // An attachment needs a name and a file.
    const attachments = page.getByTestId("attachments-field");
    await expect(attachments.locator("[data-required-mark]")).toHaveCount(2);
    await expect(attachments.locator('input[type="file"]')).toHaveAttribute(
      "aria-required",
      "true",
    );
    // The notice is not required and shows nothing extra.
    await expect(page.getByTestId("notice-field").locator("[data-required-mark]")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("ঐচ্ছিক");
    await expect(page.locator("main")).not.toContainText(`(${bn.common.required})`);
  } finally {
    await page.context().close();
  }
});
