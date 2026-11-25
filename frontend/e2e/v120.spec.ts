import { expect, test } from "@playwright/test";
import { bn } from "../messages/bn";
import { OFFICERS } from "./support/officers";
import { pageAs } from "./support/helpers";

/**
 * v1.20 (SPEC.md §13.6): group add by wing and / or designation in the meeting form.
 * - "পদবি" = উপপরিচালক lists the other Deputy Director (dd2), never the organizer (dd1);
 * - every row is checked; the button counts in Bangla digits and is disabled at ০;
 * - "নির্বাচিতদের যোগ করুন" adds the checked people and the list clears;
 * - no match: "কোনো কর্মকর্তা পাওয়া যায়নি।".
 */
const g = bn.picker.group;

test("designation filter: all checked, uncheck, add selected, list clears", async ({ browser }) => {
  const page = await pageAs(browser, "dd1");
  try {
    await page.goto("/meetings/new");
    const box = page.getByTestId("group-add");
    await expect(box.getByLabel(g.wing, { exact: true })).toHaveValue("");
    await expect(box.getByLabel(g.wing, { exact: true }).locator("option").first()).toHaveText(
      g.allWings,
    );
    await box.getByLabel(g.designation, { exact: true }).selectOption({ label: "উপপরিচালক" });

    const results = box.getByTestId("group-results");
    await expect(results.getByText(OFFICERS.dd2.nameBn)).toBeVisible();
    await expect(results.getByText(OFFICERS.dd1.nameBn)).toHaveCount(0);
    const boxes = results.getByRole("checkbox");
    const total = await boxes.count();
    for (let i = 0; i < total; i++) await expect(boxes.nth(i)).toBeChecked();

    // Uncheck everyone: the button shows ০ and is disabled.
    for (let i = 0; i < total; i++) await boxes.nth(i).uncheck();
    const zero = box.getByRole("button", { name: g.addSelected("০") });
    await expect(zero).toBeDisabled();

    // Only dd2 checked → "(১ জন)".
    await results.getByLabel(new RegExp(OFFICERS.dd2.nameBn)).check();
    await box.getByRole("button", { name: g.addSelected("১") }).click();
    await expect(page.getByTestId("selected-people").getByText(OFFICERS.dd2.nameBn)).toBeVisible();
    await expect(box.getByTestId("group-results")).toHaveCount(0);
    await expect(box.getByLabel(g.designation, { exact: true })).toHaveValue("");
  } finally {
    await page.context().close();
  }
});

test("no match shows the Bangla message", async ({ browser }) => {
  const page = await pageAs(browser, "dd1");
  try {
    await page.route("**/api/v1/users/directory?*designationId=*", (route) =>
      route.fulfill({
        json: { items: [], total: 0, page: 1, limit: 100, totalPages: 0 },
      }),
    );
    await page.goto("/meetings/new");
    const box = page.getByTestId("group-add");
    await box.getByLabel(g.designation, { exact: true }).selectOption({ index: 1 });
    await expect(box.getByText(g.none)).toBeVisible();
    await expect(box.getByRole("button", { name: /নির্বাচিতদের যোগ করুন/ })).toHaveCount(0);
  } finally {
    await page.context().close();
  }
});
