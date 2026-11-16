import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Unit tests (v1.6): plain TypeScript modules only; the UI is covered by Playwright (e2e/). */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
