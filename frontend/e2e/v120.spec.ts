import { expect, test } from "@playwright/test";
import { bn } from "../messages/bn";
import { OFFICERS } from "./support/officers";
import { pageAs } from "./support/helpers";

/**
 * v1.20 rework (SPEC.md §13.6): the participant picker has name search + "উইং" + "পদবি" in one row.
 * - "পদবি" = উপপরিচালক lists the other Deputy Director (dd2) with a "যোগ করুন" button, never the
 *   organizer (dd1); name search AND designation filter together;
 * - "এই তালিকার সবাইকে যোগ করুন (N জন)" appears only with a wing or designation filter and
 *   opens the confirmation; confirming adds the people as chips;
 * - the old v1.20 checkbox box is gone.
 */
const p = bn.picker;

test("designation filter in the top row, per-row add, add everyone with confirmation", async ({
  browser,
}) => {
  const page = await pageAs(browser, "dd1");
  try {
    await page.goto("/meetings/new");
    await expect(page.getByTestId("group-add")).toHaveCount(0);
    const designation = page.getByLabel(p.designation, { exact: true });
    await expect(designation).toHaveValue("");
    await expect(designation.locator("option").first()).toHaveText(p.allDesignations);

    // No wing / designation selected → no add-all button.
    await expect(page.getByRole("button", { name: /এই তালিকার সবাইকে যোগ করুন/ })).toHaveCount(0);

    await designation.selectOption({ label: "উপপরিচালক" });
    const results = page.getByTestId("people-results");
    await expect(results.getByText(OFFICERS.dd2.nameBn)).toBeVisible();
    await expect(results.getByText(OFFICERS.dd1.nameBn)).toHaveCount(0);

    // Name search AND designation together.
    await page.getByLabel(p.search, { exact: true }).fill("zzz-nobody");
    await expect(page.getByText(p.noResults)).toBeVisible();
    await page.getByLabel(p.search, { exact: true }).fill("");
    await expect(results.getByText(OFFICERS.dd2.nameBn)).toBeVisible();

    // Add everyone in this list → confirmation → chips.
    await page.getByRole("button", { name: /এই তালিকার সবাইকে যোগ করুন \([০-৯]+ জন\)/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(p.addAllTitle)).toBeVisible();
    await expect(dialog.getByText(/উপপরিচালক-এর [০-৯]+ জন Active কর্মকর্তাকে/)).toBeVisible();
    await dialog.getByRole("button", { name: p.addAllConfirm }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("selected-people").getByText(OFFICERS.dd2.nameBn)).toBeVisible();

    // Everyone of the list is added now: the row says "যোগ করা হয়েছে", the button shows ০ and is disabled.
    await expect(
      results.getByRole("button", { name: `${OFFICERS.dd2.nameBn}: ${p.added}` }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: p.addAll("০") })).toBeDisabled();
  } finally {
    await page.context().close();
  }
});

test("a row matched through an additional charge shows the charge label", async ({ browser }) => {
  const page = await pageAs(browser, "dd1");
  try {
    await page.route("**/api/v1/users/directory?*designationId=*", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: "00000000-0000-4000-8000-000000000120",
              nameBn: "অতিরিক্ত দায়িত্বের কর্মকর্তা",
              nameEn: "Charge Officer",
              designation: { nameBn: "সহকারী পরিচালক", nameEn: "Assistant Director", priority: 7 },
              wing: { id: "w-own", nameBn: "নিজ উইং", nameEn: "Own Wing" },
              photoPath: null,
              matchedCharge: {
                designation: { nameBn: "উপপরিচালক", nameEn: "Deputy Director", priority: 6 },
                wing: { id: "w-charge", nameBn: "দায়িত্বের উইং", nameEn: "Charge Wing" },
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      }),
    );
    await page.goto("/meetings/new");
    await page.getByLabel(p.designation, { exact: true }).selectOption({ index: 1 });
    const results = page.getByTestId("people-results");
    await expect(
      results.getByText(`উপপরিচালক ${bn.profile.chargeSuffix} · দায়িত্বের উইং`),
    ).toBeVisible();
  } finally {
    await page.context().close();
  }
});
