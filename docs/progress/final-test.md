# Final testing — stages A (parts 1–3) and B (parts 4–5)

Started 2026-11-25 on commit 8d5292d (v1.20 rework). No Playwright / browsers in this stage.

| Part | Status |
|---|---|
| 1 Frontend (typecheck, lint, unit) | done |
| 2 Backend unit (typecheck, lint, unit) | done |
| 3 Backend e2e | done |
| 4 Builds + Playwright Chromium | done |
| 5 Playwright WebKit + release | open |

## Part 1: Frontend — done
- `npm run typecheck`: pass
- `npm run lint`: pass (0 problems)
- `npm run test` (vitest): 18 files, 137 / 137 passed
- Fixed: nothing needed.

## Part 2: Backend unit — done
- `npm run typecheck`: pass
- `npm run lint`: pass (no auto-fixes)
- `npm run test` (jest): before 634 / 635 passed (1 failed) → after 635 / 635, 65 suites
- Fixed (TEST): `wording.spec.ts` found the v1.5-banned Bangla "conflict" word as a meeting title in
  `backend/test/meetings-v110.e2e-spec.ts:235` (added in 0d3169f). SPEC §13.12 bans it in every tracked file,
  so the test data was changed to "কনকারেন্ট সভা যাচাই". The wording check itself was not weakened.
- Other old words: "ঐচ্ছিক" appears only in negative assertions of frontend tests / SPEC; the v1.5 "duplicate"
  term appears nowhere. No historical-note exclusion was needed.

## Part 3: Backend e2e — done
- Test DB: `test/global-setup.ts` runs all migrations on the `_test` DB before every run; latest is
  v1.19 `1795400000000-MeetingMinutesRequired` ("No migrations are pending"). v1.20 has no schema change.
- `npm run test:e2e` (in band, whole suite in one go — memory was fine):
  before 255 / 266 passed (11 failed, 2 files) → after 266 / 266, 18 suites.
- Fixed (CODE, real bug): every attachment upload (`POST /meetings/:id/attachments`, v1.17) answered
  400 `FIELD_NOT_ALLOWED` for "file". `AttachmentUploadDto` declared `file?: unknown` without a validator;
  with target ES2023 the tsc build (`npm run build` = production, also ts-jest) defines it on the instance,
  so `forbidNonWhitelisted` rejected every upload before the permission check. Dev mode (SWC) hid it.
  Now `@Body()` uses `AttachmentUploadFieldsDto` (only `name`); `AttachmentUploadDto` (name + file) stays
  for Swagger only. `docs/openapi.json` unchanged; ValidationPipe stays strict.
- Fixed (TEST): `users.e2e-spec.ts` v1.20 block left fixtures behind ("E2EU Other" designation → unique-name
  clash; inactive "E2EU group off" → inactive count 2). Added an `afterAll` that removes them. No assertion
  was changed.
- After the fixes: backend typecheck, lint, unit (635 / 635) green again; nothing left running.

## Part 4: Builds + Playwright Chromium — done
- `npm run build` backend (tsc) and frontend (Next.js standalone): pass.
- Servers: built backend `node dist/main` (MAIL_DRY_RUN=true, E2E_TEST_HOOKS=true) and the standalone
  frontend `node .next/standalone/server.js` on :3000 (Playwright reuses it). Global setup resets the rate
  limits through `POST /test-hooks/reset-throttle`. The whole suite ran in one go, no memory kill.
- Chromium, `--workers=1`: before 62 passed / 6 failed / 3 did not run / 1 skipped
  → after 71 passed / 1 skipped (`webkit-font.spec.ts` WebKit-only test, skipped by design).
- Fixed (CODE, real bug): the office report note under "শীর্ষ ৫ অংশগ্রহণকারী" (`officeReport.topNote`, en + bn) had
  been emptied in f9059f0; SPEC §13.21 requires it. Owner confirmed: restored the original texts.
- Fixed (TEST setup): the Chromium project now uses `channel: "chromium"` (full Chromium, new headless). The
  default headless shell has no PDF viewer (`navigator.pdfViewerEnabled === false`), so the file viewer
  correctly showed its "can't show here" fallback (§13.22) and the iframe checks in v111 / v117 /
  v117-attachments failed. The app logic was not changed.
- Fixed (TEST): `v120.spec.ts` picked "পদবি" by label, which also matches the guest form's পদবি textbox (strict
  mode violation). Now the picker's select is taken by role `combobox`; no assertion changed.
- Frontend typecheck, lint, unit (137 / 137) green after the fixes.

## Next
Part 5: Playwright WebKit, final re-runs, tag v1.20.
