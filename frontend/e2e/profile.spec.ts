import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apiAsPage, pageAs } from "./support/helpers";
import { OFFICERS } from "./support/officers";

/** A real 64×64 PNG (the backend checks magic bytes and re-encodes it with sharp). */
const PHOTO = readFileSync(join(__dirname, "fixtures", "photo.png"));

test("profile: edit with Bangla digits, charges list, photo upload and remove", async ({
  browser,
}) => {
  const page = await pageAs(browser, "officer");
  try {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "প্রোফাইল", level: 1 })).toBeVisible();

    // Mobile in Bangla digits with +880 → stored as 01XXXXXXXXX.
    await page.getByLabel("Mobile", { exact: true }).fill("+৮৮০ ১৭১১-০০০০০১");
    // Additional charges: an editable list.
    await page.getByRole("button", { name: "দায়িত্ব যোগ করুন" }).click();
    const charge = `ই২ই ফোকাল পয়েন্ট ${Date.now().toString(36)}`;
    await page.getByLabel("অতিরিক্ত দায়িত্ব ১", { exact: true }).fill(charge);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Profile হালনাগাদ হয়েছে।")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Mobile", { exact: true })).toHaveValue("01711000001");
    await expect(page.getByLabel("অতিরিক্ত দায়িত্ব ১", { exact: true })).toHaveValue(charge);

    // A wrong mobile is caught before sending.
    await page.getByLabel("Mobile", { exact: true }).fill("১২৩");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/সঠিক Mobile নম্বর দিন/)).toBeVisible();
    await page.getByRole("button", { name: "আগের অবস্থায় ফেরান" }).click();

    // Remove the charge again (keeps the test account clean).
    await page
      .getByRole("button", { name: /^বাদ দিন/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Profile হালনাগাদ হয়েছে।").first()).toBeVisible();

    // Photo: a non-image is refused in the browser already.
    const fileInput = page.getByLabel("ছবি বেছে নিন");
    await fileInput.setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("x"),
    });
    await expect(page.getByText("শুধু JPEG, PNG বা WebP ছবি দেওয়া যাবে।")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload Photo" })).toBeDisabled();

    // A real PNG: preview, upload, then shown on the page and next to my name in the header.
    await fileInput.setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PHOTO });
    await expect(page.getByRole("img", { name: "নতুন ছবির নমুনা" })).toBeVisible();
    await page.getByRole("button", { name: "Upload Photo" }).click();
    await expect(page.getByText("ছবি Upload হয়েছে।")).toBeVisible();
    await expect(page.getByTestId("profile-photo")).toHaveAttribute("src", /^\/uploads\/.+\.webp$/);
    await expect(
      page.getByTestId("user-menu-button").locator("img[src^='/uploads/']"),
    ).toBeVisible();
    await expect(page.getByTestId("user-menu-button")).toHaveAccessibleName(
      OFFICERS.officer.nameBn,
    );

    // Remove it again (with a confirmation).
    await page.getByRole("button", { name: "ছবি সরান" }).click();
    const dialog = page.getByRole("dialog", { name: "ছবি সরাবেন?" });
    await dialog.getByRole("button", { name: "ছবি সরান" }).click();
    await expect(page.getByText("ছবি সরানো হয়েছে।")).toBeVisible();
    await expect(page.getByTestId("profile-photo")).toHaveCount(0);
  } finally {
    await page.context().close();
  }
});

test("profile: notification email pending, change request created and cancelled", async ({
  browser,
  browserName,
}) => {
  // One officer per browser: the backend allows only a few verification mails per user per minute.
  const key = browserName === "webkit" ? "so" : "officer";
  const page = await pageAs(browser, key);
  try {
    // Cancel leftovers of earlier runs.
    const mine = await apiAsPage<{ id: string; status: string }[]>(
      page,
      "GET",
      "/profile/change-requests",
    );
    for (const r of mine.filter((x) => x.status === "PENDING")) {
      await apiAsPage(page, "DELETE", `/profile/change-requests/${r.id}`);
    }

    await page.goto("/profile");
    const newAddress = `e2e-${key}+${Date.now().toString(36)}@example.com`;
    await page.getByLabel("নতুন Notification Email").fill(newAddress);
    await page.getByRole("button", { name: "Send Verification Link" }).click();
    await expect(page.getByText(`যাচাইয়ের অপেক্ষায়: ${newAddress}`)).toBeVisible();
    await expect(page.getByTestId("notification-email")).toHaveText(OFFICERS[key].loginEmail);

    // Login email change request → in the history as "Pending" → cancel it.
    const requested = `e2e-${key}-new-${Date.now().toString(36)}@example.com`;
    await page.getByLabel("নতুন Login Email").fill(requested);
    await page
      .getByTestId("request-login-email-form")
      .getByRole("button", { name: "Send Request" })
      .click();
    const item = page
      .getByTestId("request-history")
      .getByRole("listitem")
      .filter({ hasText: requested });
    await expect(item).toContainText("Pending");
    await expect(page.getByLabel("নতুন Login Email")).toBeDisabled();

    // v1.5: the designation select shows names only, never a priority number.
    await expect(
      page.getByLabel("নতুন পদবি").locator("option", { hasText: /^মহাপরিচালক$/ }),
    ).toHaveCount(1);
    await expect(
      page.getByLabel("নতুন পদবি").locator("option", { hasText: "অগ্রাধিকার" }),
    ).toHaveCount(0);

    await item.getByRole("button", { name: "Cancel Request" }).click();
    await page
      .getByRole("dialog", { name: "অনুরোধ বাতিল করবেন?" })
      .getByRole("button", { name: "Cancel Request" })
      .click();
    await expect(item).toContainText("Cancelled");
    await expect(page.getByLabel("নতুন Login Email")).toBeEnabled();

    // Voluntary password section is on the page.
    await expect(page.getByRole("heading", { name: "Password পরিবর্তন" })).toBeVisible();
  } finally {
    await page.context().close();
  }
});
