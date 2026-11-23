import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * v1.5 wording (SPEC.md §13.12): the old Bangla word for "conflict" and the phrase
 * "outside guest" must never come back in UI text (the time clash is "সময় কনফ্লিক্ট",
 * everything else "কনকারেন্ট সভা" since v1.18 — the v1.5 Bangla term is forbidden too; guests are
 * "অতিথি কর্মকর্তা"). Written as \u escapes so
 * this file does not contain the words. The backend test wording.spec.ts checks every file.
 */
const FORBIDDEN_WORDING =
  "/\\u09B8\\u0982\\u0998\\u09BE\\u09A4|\\u09AC\\u09B9\\u09BF\\u09B0\\u09BE\\u0997\\u09A4 \\u0985\\u09A4\\u09BF\\u09A5\\u09BF|\\u09A1\\u09C1\\u09AA\\u09CD\\u09B2\\u09BF\\u0995\\u09C7\\u099F \\u09B8\\u09AD\\u09BE/u";
/** v1.18: the English term is "Concurrent meetings"; the old one (split here) never comes back. */
const FORBIDDEN_EN_WORDING = "/\\bdupli" + "cate[- ]meetings?\\b/i";
const WORDING_MESSAGE =
  "Old wording (SPEC.md §13.12 v1.5/v1.18): use সময় কনফ্লিক্ট / কনকারেন্ট সভা (Concurrent meetings) / অতিথি কর্মকর্তা.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${FORBIDDEN_WORDING}]`, message: WORDING_MESSAGE },
        { selector: `TemplateElement[value.raw=${FORBIDDEN_WORDING}]`, message: WORDING_MESSAGE },
        { selector: `JSXText[value=${FORBIDDEN_WORDING}]`, message: WORDING_MESSAGE },
        { selector: `Literal[value=${FORBIDDEN_EN_WORDING}]`, message: WORDING_MESSAGE },
        { selector: `TemplateElement[value.raw=${FORBIDDEN_EN_WORDING}]`, message: WORDING_MESSAGE },
        { selector: `JSXText[value=${FORBIDDEN_EN_WORDING}]`, message: WORDING_MESSAGE },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output (git-ignored; the HTML report bundles the trace viewer's JavaScript).
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;
