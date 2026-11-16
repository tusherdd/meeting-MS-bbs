import { expect, test } from "@playwright/test";
import { en } from "../messages/en";
import { bn } from "../messages/bn";
import { FRONTEND_ORIGIN } from "./support/officers";
import { pageAs } from "./support/helpers";

/**
 * v1.6 (SPEC.md §13.14): English is the default UI language; the text-only switch changes it
 * and the `lang` cookie keeps it; API messages follow it (Accept-Language); PDF stays Bangla.
 */
const BANGLA = /[ঀ-৿]/;

test("public: no cookie → English login page; the switch turns it Bangla and back", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("button", { name: en.auth.loginButton })).toBeVisible();

    const toBn = page.getByTestId("language-switch");
    await expect(toBn).toHaveText(bn.language.name);
    await toBn.click();
    await expect(page.getByRole("button", { name: bn.auth.loginButton })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
    const cookie = (await context.cookies()).find((c) => c.name === "lang");
    expect(cookie?.value).toBe("bn");

    // The choice survives a reload.
    await page.reload();
    await expect(page.getByRole("button", { name: bn.auth.loginButton })).toBeVisible();

    await page.getByTestId("language-switch").click();
    await expect(page.getByRole("button", { name: en.auth.loginButton })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("public: a failed login shows the backend message in the UI language", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await page.getByLabel(en.auth.loginEmail).fill("nobody@e2e-lang.test");
    await page.getByLabel(en.auth.password, { exact: true }).fill("Wrong12345");
    await page.getByRole("button", { name: en.auth.loginButton }).click();
    await expect(page.getByText("Email or password is incorrect.", { exact: false })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("logged in: English pages, then Bangla after switching (session kept)", async ({
  browser,
}) => {
  const page = await pageAs(browser, "officer", "en");
  try {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: en.dashboard.title, level: 1 })).toBeVisible();
    await page.goto("/conflicts");
    await expect(
      page.getByRole("heading", { name: en.conflictsPage.title, level: 1 }),
    ).toBeVisible();

    await page.getByTestId("language-switch").click();
    await expect(
      page.getByRole("heading", { name: bn.conflictsPage.title, level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/conflicts$/);
  } finally {
    await page.context().close();
  }
});

test("API: errors follow the lang cookie; codes stay the same", async ({ browser }) => {
  for (const lang of ["en", "bn"] as const) {
    const page = await pageAs(browser, "officer", lang);
    try {
      await page.goto("/dashboard");
      const res = await page.request.post("/api/v1/meetings", {
        data: {},
        headers: { Origin: FRONTEND_ORIGIN, "Accept-Language": lang },
      });
      expect(res.status()).toBe(400);
      const body = (await res.json()) as { message: string[]; code: string; codes: string[] };
      expect(body.codes.length).toBe(body.message.length);
      for (const m of body.message) expect(BANGLA.test(m)).toBe(lang === "bn");
    } finally {
      await page.context().close();
    }
  }
});

test("PDF report stays Bangla when the UI is English", async ({ browser }) => {
  const page = await pageAs(browser, "officer", "en");
  try {
    await page.goto("/reports");
    const res = await page.request.get("/api/v1/reports/me/pdf?period=day", {
      headers: { "Accept-Language": "en" },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    const pdf = await res.body();
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.includes("NikoshBAN")).toBe(true); // the Bangla font is embedded
  } finally {
    await page.context().close();
  }
});
