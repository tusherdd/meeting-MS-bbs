import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests in a real browser against the real backend (dev database, MAIL_DRY_RUN=true).
 * - The backend must already run on BACKEND_URL (default http://localhost:4000).
 * - The frontend runs on http://localhost:3000 (it must match the backend's CORS_ORIGINS,
 *   because the backend checks the Origin header). An already running `npm run dev` is reused.
 * - One worker, in order: the backend limits logins to 10 per minute per IP.
 * - Two browsers (v1.5): Chromium and WebKit (Safari's engine; the Bangla font differs there,
 *   SPEC.md §13.10). @playwright/test is pinned to 1.61.1: on macOS 14 Playwright only has a
 *   frozen WebKit build (2251), and Playwright 1.62+ can no longer open pages in it. After
 *   upgrading macOS (15+), the pin can go.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Browsers are Playwright fixtures and always closed by the runner; the teardown also removes
  // orphans of an earlier hard-killed run (see e2e/support/orphans.ts).
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  // Stop a stuck run instead of keeping browsers open forever.
  globalTimeout: 30 * 60_000,
  use: {
    baseURL: "http://localhost:3000",
    // Not Dhaka on purpose: the UI must show Dhaka time whatever the computer's zone is.
    timezoneId: "UTC",
    locale: "bn-BD",
    // v1.6: Bangla UI by default (cookie lang=bn, written by global-setup); English is tested in
    // language.spec.ts with its own contexts.
    storageState: "./e2e/.state/lang-bn.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
