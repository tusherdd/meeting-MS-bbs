import { expect, test } from "@playwright/test";
import {
  apiAsPage,
  cancelLeftovers,
  cancelMeetingAs,
  createMeetingAs,
  dhakaDate,
  dhakaIso,
  pageAs,
  uniqueTitle,
  userIdOf,
} from "./support/helpers";
import { OFFICERS } from "./support/officers";

/**
 * The two header icons (owner decision 2026-11-14, SPEC.md §13.5): the notification bell with
 * its unread badge, and the round profile icon with the user menu.
 */
test("bell icon: unread badge in Bangla digits, aria-label, tooltip, dropdown", async ({
  browser,
}) => {
  const officer = await pageAs(browser, "officer");
  const dg = await pageAs(browser, "dg");
  let meetingId: string | undefined;
  try {
    // Start from zero unread: no badge, plain label.
    await apiAsPage(officer, "PATCH", "/notifications/read-all");
    await officer.goto("/dashboard");
    const bell = officer.getByTestId("notifications-button");
    await expect(bell).toHaveAccessibleName("নোটিফিকেশন");
    await expect(bell).toHaveAttribute("title", "নোটিফিকেশন");
    await expect(bell.locator("svg[data-header-icon='bell']")).toBeVisible();
    await expect(officer.getByTestId("notifications-badge")).toHaveCount(0);
    // An icon button: no visible text inside.
    expect((await bell.innerText()).trim()).toBe("");

    // The DG invites the officer: one unread notification.
    await dg.goto("/dashboard");
    await cancelLeftovers(dg);
    const date = dhakaDate(6);
    const meeting = await createMeetingAs(dg, {
      title: uniqueTitle("হেডার"),
      startAt: dhakaIso(date, "07:00"),
      endAt: dhakaIso(date, "07:30"),
      participantIds: [await userIdOf(officer)],
    });
    meetingId = meeting.id;

    await officer.reload();
    await expect(officer.getByTestId("notifications-badge")).toHaveText("১");
    await expect(bell).toHaveAccessibleName("নোটিফিকেশন, ১টি অপঠিত");

    // Clicking opens the same dropdown as before; "সব পড়া হয়েছে" clears the badge.
    await bell.click();
    await expect(officer.getByText(meeting.title).first()).toBeVisible();
    await officer.getByRole("button", { name: "সব পড়া হয়েছে" }).click();
    await expect(officer.getByTestId("notifications-badge")).toHaveCount(0);
    await officer.keyboard.press("Escape");
    await expect(bell).toBeFocused();

    // More than 9 unread: "৯+" on the badge, the exact number in the label.
    await officer.route("**/api/v1/notifications/unread-count", (route) =>
      route.fulfill({ json: { count: 12 } }),
    );
    await officer.reload();
    await expect(officer.getByTestId("notifications-badge")).toHaveText("৯+");
    await expect(bell).toHaveAccessibleName("নোটিফিকেশন, ১২টি অপঠিত");
  } finally {
    if (meetingId) await cancelMeetingAs(dg, meetingId);
    await officer.context().close();
    await dg.context().close();
  }
});

test("profile icon: name as label and tooltip, menu with name, designation and links", async ({
  browser,
}) => {
  const page = await pageAs(browser, "officer");
  try {
    await page.goto("/dashboard");
    const button = page.getByTestId("user-menu-button");
    await expect(button).toHaveAccessibleName(OFFICERS.officer.nameBn);
    await expect(button).toHaveAttribute("title", OFFICERS.officer.nameBn);
    // No photo: the person icon (with a photo the same round button shows the photo).
    await expect(button.locator("svg[data-header-icon='profile'], img")).toHaveCount(1);
    expect((await button.innerText()).trim()).toBe("");

    // Keyboard: focus is visible (outline) and Enter opens the menu.
    await button.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(button).toBeFocused();
    expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter");

    const header = page.getByTestId("user-menu-header");
    await expect(header).toContainText(OFFICERS.officer.nameBn);
    await expect(header).toContainText("পরিসংখ্যান কর্মকর্তা");
    await expect(page.getByRole("link", { name: "প্রোফাইল" }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "লগআউট" })).toBeVisible();
    await page.getByRole("link", { name: "পাসওয়ার্ড পরিবর্তন" }).click();
    await expect(page).toHaveURL(/\/change-password$/);

    // Phone width: both icons stay in the header, same size, next to the menu button.
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/dashboard");
    const bell = page.getByTestId("notifications-button");
    await expect(bell).toBeVisible();
    await expect(button).toBeVisible();
    const [a, b] = [await bell.boundingBox(), await button.boundingBox()];
    expect(a && b && a.width === b.width && a.height === b.height).toBe(true);
    expect(b && b.x + b.width).toBeLessThanOrEqual(390);
    const sizes = await page
      .locator("header svg[data-header-icon]")
      .evaluateAll((icons) => icons.map((i) => i.getBoundingClientRect().width));
    expect(sizes.every((w) => w === 24)).toBe(true);
  } finally {
    await page.context().close();
  }
});
