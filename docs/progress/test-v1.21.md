# Testing v1.21 (notice → form fill) — stages A (parts 1–3) and B (parts 4–5)

Started 2026-11-26 on commit 4934d01 (v1.21 part 3). No real Anthropic API calls: the AI tests use mocks.

| Part | Status |
|---|---|
| 1 Frontend (typecheck, lint, unit) | done |
| 2 Backend unit (typecheck, lint, unit) | done |
| 3 Backend e2e | done |
| 4 Builds + Playwright Chromium | done |
| 5 Playwright WebKit + release | done |

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
- Fixed: no app code needed. The nukta check caught a broken "পড়া" in this progress file (fixed).

## Part 4: Builds + Playwright Chromium — done
- `npm run build` backend (tsc) and frontend (Next.js standalone): pass. Dev DB already had `AppSettings` migrated.
- Servers: built backend `node dist/main` (MAIL_DRY_RUN=true, E2E_TEST_HOOKS=true) + standalone frontend on :3000;
  global setup resets the rate limits (`POST /test-hooks/reset-throttle`).
- Chromium full suite, `--workers=1`, first run: 71 passed / 2 failed / 1 skipped (`webkit-font.spec.ts`, by design).
  Both failures in `v121-notice-fill.spec.ts`:
  - Fixed (CODE, real bug): after "বসান" in the overwrite confirmation, the native dialog's `close` event called
    `onClose` → status back to idle while the request was still running: "নোটিশ পড়া হচ্ছে…" and Cancel vanished
    and the fill button was enabled again (a second read could start, counting twice against 20/day). Now the
    modal's close only resets a status that is still "confirm" (`components/meetings/notice-fill.tsx`).
  - Fixed (TEST): `getByLabel("সভাপতি")` also matched the chair review box (a region named by its "সভাপতি" heading,
    correct a11y) → strict-mode violation. The select is now taken by role `combobox`; no assertion changed.
- Frontend typecheck, lint, unit (153 / 153) green after the fix; `v121-notice-fill.spec.ts` 2 / 2 on Chromium.
- Second full Chromium run: 71 passed / 2 failed (auth "logout ends the session", language "failed login") — the
  backend answered 429 on login after only ~4 logins since the throttle reset.
  - Fixed (CODE, test-only module): `POST /test-hooks/reset-throttle` cleared only `storage`; @nestjs/throttler
    6.7 keeps each hit's expiry in a second (private) map and rebuilds the count from it, so the reset did nothing
    and the setup's own logins still counted. Now it calls the public `onApplicationShutdown()` (empties both maps).
    The unit test `test-hooks.guard.spec.ts` now checks that the next hit after a reset counts as 1 and is not
    blocked (it failed on the old code). Production limits are unchanged (the module is never loaded there).
- Final Chromium run (rebuilt backend + frontend, `--workers=1`, split in two groups of 17 + 14 specs because the
  editor session was killed twice during long runs): group A 52 passed, group B 21 passed / 1 skipped
  → **73 passed / 1 skipped** (`webkit-font.spec.ts` WebKit-only test, by design). Before: 71 / 2 failed / 1 skipped.

## Part 5: Playwright WebKit + release — done
- WebKit, `--workers=1`, same servers, two groups: group A 51 passed / 1 skipped, group B 21 passed / 1 skipped
  → **72 passed / 2 skipped** on the first run (by design: `fonts.spec.ts` is Chromium-only, WebKit has its own
  Bangla font; the engine-independent `webkit-font.spec.ts` test runs once, on Chromium). Fixed: nothing needed.
- Final re-run after all fixes: Playwright specs touched by fixes (`v121-notice-fill`, `auth`, `language`) on
  Chromium + WebKit 28 / 28; backend typecheck + lint green, unit 733 / 733; frontend typecheck + lint green,
  unit 153 / 153.
- Fixed (DOC): the nukta check found "পড়া" in the broken form in this progress file again (my notes); normalized.
- Tagged `v1.21`. All servers and browsers stopped.
- Not committed on purpose: `backend/package-lock.json` (an npm-added `"peer": true` on zod, present before testing).

## Testing v1.21 complete
Stages A and B done on 2026-11-26. One real app bug found and fixed (the overwrite confirmation dropped the
"reading" state); one broken test hook fixed (throttle reset). No test skipped beyond the by-design engine skips.
