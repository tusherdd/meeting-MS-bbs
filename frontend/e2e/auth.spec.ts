import { expect, test } from "@playwright/test";
import { INVALID_LOGIN_MESSAGE, fillLogin, loginThroughForm, pageAs } from "./support/helpers";
import { OFFICERS, credentialsOf } from "./support/officers";

test.describe("Login and session", () => {
  test("wrong password shows the backend's generic message and stays on /login", async ({
    page,
  }) => {
    const officer = credentialsOf("officer");
    await page.goto("/login");
    await fillLogin(page, officer.loginEmail, `${officer.password}x`);

    await expect(page.getByRole("alert")).toHaveText(INVALID_LOGIN_MESSAGE);
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
    await expect(page.getByText("শীঘ্রই আসছে")).toBeVisible();
  });

  test("mustChangePassword sends every (app) page to /change-password", async ({ browser }) => {
    const page = await pageAs(browser, "officer");

    // No API can set mustChangePassword with a known password, so the flag is simulated:
    // the real /auth/me answer is passed through with mustChangePassword = true.
    await page.route("**/api/v1/auth/me", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, mustChangePassword: true } });
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

  test("logout ends the session", async ({ page }) => {
    await loginThroughForm(page, "officer");
    await page.getByRole("button", { name: "ব্যবহারকারী মেনু" }).click();
    await page.getByRole("button", { name: "লগআউট" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // The cookies are gone: the dashboard is not reachable any more.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });
});
