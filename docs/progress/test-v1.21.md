# Testing v1.21 (notice → form fill) — stages A (parts 1–3) and B (parts 4–5)

Started 2026-11-26 on commit 4934d01 (v1.21 part 3). No real Anthropic API calls: the AI tests use mocks.

| Part | Status |
|---|---|
| 1 Frontend (typecheck, lint, unit) | done |
| 2 Backend unit (typecheck, lint, unit) | done |
| 3 Backend e2e | done |
| 4 Builds + Playwright Chromium | next |
| 5 Playwright WebKit + release | open |

## Part 1: Frontend — done
- `npm run typecheck`: pass
- `npm run lint`: pass (0 problems)
- `npm run test` (vitest): 19 files, 153 / 153 passed (incl. `notice-fill.test.ts`, 13 tests)
- Fixed: nothing needed.

## Part 2: Backend unit — done
- `npm run typecheck`: pass
- `npm run lint`: pass (no auto-fixes)
- `npm run test` (jest): before 732 / 733 passed (1 failed) → after 733 / 733, 76 suites.
  The v1.21 suites (notice-extract + settings, 11 suites incl. ai-extractor, notice-reader, ai-reply,
  extraction-cache, settings.service, ocr-engine.service) are 98 / 98. The OCR engine test uses a fake worker
  (no tesseract.js load); it checks idle and shutdown termination. No open handles.
- Fixed (DOC): `bangla-source.spec.ts` found "পড়া" written as DDA + NUKTA in SPEC.md (lines 1164, 1184, added in
  4934d01). SPEC §13.13 requires the precomposed RRA (U+09DC); only the two characters changed, no wording.

## Part 3: Backend e2e — done
- Test DB: `test/global-setup.ts` migrates and empties the `_test` DB before every run; it applied the new v1.21
  migration `AppSettings1795500000000` (table `app_settings`).
- No e2e coverage for v1.21 existed. Added (TEST) `backend/test/notice-extract.e2e-spec.ts`, 12 tests:
  - `POST /meetings/notice-extract`: SUPER_ADMIN 403; wrong type (text file, renamed .exe) 400; macro DOCX and
    no file 400; the 21st call of one user in a day 429 while another user still gets 200.
  - a DOCX notice in the fixed format (built in the test, anonymized, `docxFromLines()` added to the test-only
    `docx.fixture-spec.ts`) → title, date, start / end (+45 min), venue, agenda, chair `sure`, distribution
    sure / not-found / group, nothing from the signature or "অনুলিপি"; no meeting stored; audit
    `NOTICE_EXTRACTED` has only `method, success, durationMs`.
  - `GET / PATCH /admin/settings`: default OCR + `aiAvailable: false`; AI without a key 400
    "API key সেট করা নেই।" (no row, no audit); invalid value 400; OCR 200; officers 403; SUPER_ADMIN reads.
  - The rate limit is skipped under NODE_ENV=test app-wide, so this file overrides only the throttler options
    with the same limits and tracker as `app.module.ts` minus the skip (the app code is unchanged).
    `ANTHROPIC_API_KEY` is forced empty in the test: no AI call can happen.
- `npm run test:e2e` (in band, whole suite): before 266 / 266, 18 suites → after 278 / 278, 19 suites.
- Fixed: no app code needed. The nukta check caught a broken "পড়া" in this progress file (fixed).
- Next: part 4 (builds + Playwright Chromium).
