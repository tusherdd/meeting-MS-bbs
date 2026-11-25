# Testing v1.21 (notice → form fill) — stages A (parts 1–3) and B (parts 4–5)

Started 2026-11-26 on commit 4934d01 (v1.21 part 3). No real Anthropic API calls: the AI tests use mocks.

| Part | Status |
|---|---|
| 1 Frontend (typecheck, lint, unit) | done |
| 2 Backend unit (typecheck, lint, unit) | done |
| 3 Backend e2e | next |
| 4 Builds + Playwright Chromium | open |
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
- Fixed (DOC): `bangla-source.spec.ts` found "পড়া" written as DDA + NUKTA in SPEC.md (lines 1164, 1184, added in
  4934d01). SPEC §13.13 requires the precomposed RRA (U+09DC); only the two characters changed, no wording.
- Next: part 3 (backend e2e).
