# Final testing — stage A (parts 1–3)

Started 2026-11-25 on commit 8d5292d (v1.20 rework). No Playwright / browsers in this stage.

| Part | Status |
|---|---|
| 1 Frontend (typecheck, lint, unit) | done |
| 2 Backend unit (typecheck, lint, unit) | done |
| 3 Backend e2e | next |

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

## Next
Part 3: migrate the test DB, run the backend e2e suite (file by file if memory is tight).
