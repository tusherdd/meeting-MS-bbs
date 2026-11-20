import { expect, test } from "@playwright/test";
import { apiAsPage, pageAs, userIdOf } from "./support/helpers";

/**
 * v1.16 (SPEC.md §6.2): structured additional charges — only an admin edits them (designation,
 * wing, note); the officer sees them read-only; validation in the admin form; the users list has
 * the "needs review" filter.
 */
test("admin edits an officer's additional charges; the officer sees them read-only", async ({
  browser,
}) => {
  const officer = await pageAs(browser, "officer");
  const admin = await pageAs(browser, "admin");
  try {
    const id = await userIdOf(officer);
    // Start clean (an admin call, as the UI would do).
    await apiAsPage(admin, "PATCH", `/users/${id}`, { additionalCharges: [] });

    await admin.goto(`/admin/users/${id}`);
    const editor = admin.getByTestId("charges-editor");
    await expect(editor).toBeVisible();
    await editor.getByRole("button", { name: "দায়িত্ব যোগ করুন" }).click();
    // Rows by position (a `.last()` locator would move to the next row added).
    const row = editor.getByTestId("charge-row").nth(0);
    await row.getByLabel("পদবি").selectOption({ label: "পরিসংখ্যান কর্মকর্তা" });
    await row.getByLabel("উইং").selectOption({ index: 1 });
    await row.getByLabel("নোট").fill("চলতি দায়িত্ব");

    // The same charge twice is refused before sending.
    await editor.getByRole("button", { name: "দায়িত্ব যোগ করুন" }).click();
    const twin = editor.getByTestId("charge-row").nth(1);
    await twin.getByLabel("পদবি").selectOption({ label: "পরিসংখ্যান কর্মকর্তা" });
    await twin.getByLabel("উইং").selectOption(await row.getByLabel("উইং").inputValue());
    await admin.getByRole("button", { name: "Save Changes" }).click();
    await expect(
      admin.getByText("একই অতিরিক্ত দায়িত্ব (পদবি ও উইং) দুবার দেওয়া যাবে না।"),
    ).toBeVisible();
    await twin.getByRole("button", { name: /^বাদ দিন/ }).click();

    await admin.getByRole("button", { name: "Save Changes" }).click();
    const list = admin.getByTestId("additional-charges");
    await expect(list).toContainText("পরিসংখ্যান কর্মকর্তা (অতিরিক্ত দায়িত্ব), ");
    await expect(list).toContainText(" — চলতি দায়িত্ব");

    // The officer: read-only, with the admin-only note.
    await officer.goto("/profile");
    const mine = officer.getByTestId("additional-charges");
    await expect(mine).toContainText("পরিসংখ্যান কর্মকর্তা (অতিরিক্ত দায়িত্ব)");
    await expect(mine).toContainText("অতিরিক্ত দায়িত্ব শুধু অ্যাডমিন বদলাতে পারেন।");
    await expect(officer.getByLabel("নোট")).toHaveCount(0);

    // The users list has the "needs review" filter.
    await admin.goto("/admin/users");
    await admin.getByLabel("অতিরিক্ত দায়িত্ব").selectOption({ label: "যাচাই দরকার" });
    await expect(admin).toHaveURL(/chargesNeedReview=true/);
  } finally {
    // Clean up through the admin API (the test account keeps no charge).
    const id = await userIdOf(officer).catch(() => null);
    if (id) await apiAsPage(admin, "PATCH", `/users/${id}`, { additionalCharges: [] });
    await officer.context().close();
    await admin.context().close();
  }
});
