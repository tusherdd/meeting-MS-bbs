import { expect, test } from "@playwright/test";
import {
  INVALID_LOGIN_MESSAGE,
  apiAsPage,
  fillLogin,
  loginThroughForm,
  pageAs,
} from "./support/helpers";
import { OFFICERS, credentialsOf } from "./support/officers";

test.describe("Login and session", () => {
  test("wrong password shows the backend's generic message and stays on /login", async ({
    page,
  }) => {
    const officer = credentialsOf("officer");
    await page.goto("/login");
    await fillLogin(page, officer.loginEmail, `${officer.password}x`);

    // The alert shows the backend's message (+ the request number). Next.js also has an
    // empty role="alert" route announcer, so pick the alert that has text.
    await expect(
      page.getByRole("alert").filter({ hasText: /\S/ }).getByRole("paragraph").first(),
    ).toHaveText(INVALID_LOGIN_MESSAGE);
    await expect(page).toHaveURL(/\/login$/);
    // The password field is emptied, the email stays.
    await expect(page.getByLabel("পাসওয়ার্ড", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("লগইন ইমেইল")).toHaveValue(officer.loginEmail);
  });

  test("correct password opens the dashboard; no token is stored in the browser", async ({
    page,
    context,
  }) => {
    await loginThroughForm(page, "officer");
    await expect(page.getByText(OFFICERS.officer.nameBn).first()).toBeVisible();

    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "access_token")?.httpOnly).toBe(true);
    const storage = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(storage).not.toMatch(/eyJ/); // no JWT in localStorage / sessionStorage
  });

  test("an (app) page without a session redirects to /login?next= and back after login", async ({
    page,
  }) => {
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/login\?next=%2Freports$/);

    const officer = credentialsOf("officer");
    await fillLogin(page, officer.loginEmail, officer.password);
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole("heading", { name: "রিপোর্ট", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "প্রধান মেনু" })).toBeVisible();
  });

  test("officers on the default password: no redirect, no banner or reminder", async ({
    browser,
  }) => {
    const page = await pageAs(browser, "officer");
    const me = await apiAsPage<{ passwordIsDefault: boolean; mustChangePassword: boolean }>(
      page,
      "GET",
      "/auth/me",
    );
    expect(me).toMatchObject({ passwordIsDefault: true, mustChangePassword: false });

    for (const path of ["/dashboard", "/meetings", "/calendar"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("navigation", { name: "প্রধান মেনু" })).toBeVisible();
      await expect(page.getByText(/ডিফল্ট পাসওয়ার্ড|পাসওয়ার্ড পরিবর্তন করুন/)).toHaveCount(0);
    }
    // Changing the password stays possible voluntarily.
    await page.goto("/change-password");
    await expect(page.getByRole("heading", { name: "পাসওয়ার্ড পরিবর্তন" })).toBeVisible();
    await expect(page.getByText("নিরাপত্তার জন্য প্রথমে")).toHaveCount(0);
    await page.context().close();
  });

  test("SUPER_ADMIN with mustChangePassword is sent to /change-password", async ({ browser }) => {
    const page = await pageAs(browser, "officer");

    // Only the SUPER_ADMIN can still have a forced change (2026-11-09). Its password is not
    // used in tests, so its /auth/me answer is simulated on top of a real session.
    await page.route("**/api/v1/auth/me", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({
        response,
        json: { ...body, role: "SUPER_ADMIN", mustChangePassword: true },
      });
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole("heading", { name: "পাসওয়ার্ড পরিবর্তন" })).toBeVisible();
    await expect(
      page.getByText("নিরাপত্তার জন্য প্রথমে আপনার পাসওয়ার্ড পরিবর্তন করুন"),
    ).toBeVisible();
    // Restricted layout: no menu, no bell.
    await expect(page.getByRole("navigation", { name: "প্রধান মেনু" })).toHaveCount(0);

    await page.goto("/meetings");
    await expect(page).toHaveURL(/\/change-password$/);

    // Back to the real answer → the dashboard opens again.
    await page.unroute("**/api/v1/auth/me");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.context().close();
  });

  test("a session that ends while working goes to /login?next=… with a Bangla note", async ({
    browser,
  }) => {
    const page = await pageAs(browser, "officer");
    try {
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: "ড্যাশবোর্ড", level: 1 })).toBeVisible();
      // The session disappears (as if it expired): no cookies any more.
      await page.context().clearCookies();
      await page
        .getByRole("navigation", { name: "প্রধান মেনু" })
        .getByRole("link", { name: "রিপোর্ট" })
        .click();
      await expect(page).toHaveURL(/\/login\?next=%2Freports&reason=expired$/);
      await expect(
        page.getByText("সেশনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে আবার লগইন করুন।"),
      ).toBeVisible();
    } finally {
      await page.context().close();
    }
  });

  test("logout ends the session", async ({ page }) => {
    await loginThroughForm(page, "officer");
    await page.getByRole("button", { name: OFFICERS.officer.nameBn }).click();
    await page.getByRole("button", { name: "লগআউট" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // The cookies are gone: the dashboard is not reachable any more.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });
});
