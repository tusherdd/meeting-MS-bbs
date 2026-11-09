import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests in a real browser against the real backend (dev database, MAIL_DRY_RUN=true).
 * - The backend must already run on BACKEND_URL (default http://localhost:4000).
 * - The frontend runs on http://localhost:3000 (it must match the backend's CORS_ORIGINS,
 *   because the backend checks the Origin header). An already running `npm run dev` is reused.
 * - One worker, in order: the backend limits logins to 10 per minute per IP.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    // Not Dhaka on purpose: the UI must show Dhaka time whatever the computer's zone is.
    timezoneId: "UTC",
    locale: "bn-BD",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
