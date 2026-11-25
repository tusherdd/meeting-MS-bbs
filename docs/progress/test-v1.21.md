# Testing v1.21 (notice → form fill) — stages A (parts 1–3) and B (parts 4–5)

Started 2026-11-26 on commit 4934d01 (v1.21 part 3). No real Anthropic API calls: the AI tests use mocks.

| Part | Status |
|---|---|
| 1 Frontend (typecheck, lint, unit) | done |
| 2 Backend unit (typecheck, lint, unit) | next |
| 3 Backend e2e | open |
| 4 Builds + Playwright Chromium | open |
| 5 Playwright WebKit + release | open |

## Part 1: Frontend — done
- `npm run typecheck`: pass
- `npm run lint`: pass (0 problems)
- `npm run test` (vitest): 19 files, 153 / 153 passed (incl. `notice-fill.test.ts`, 13 tests)
- Fixed: nothing needed.
- Next: part 2 (backend unit).
