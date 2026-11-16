import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Visual review screenshots (v1.8), not part of `npm run test:e2e`:
 *   SHOTS=before npx playwright test -c playwright.screenshots.config.ts
 * Saves to frontend/screenshots/<SHOTS>/ (git-ignored). Same browsers and setup as the e2e suite.
 */
export default defineConfig({
  ...base,
  testDir: "./e2e-screens",
  testMatch: /.*\.screens\.ts$/,
  timeout: 300_000,
  reporter: [["list"]],
});
