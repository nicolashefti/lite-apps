# 2026-07-08 — Testing setup

## What was added

- `package.json` with `"type": "module"` and Vitest as the only dev dependency.
- `npm test` → `vitest run` (single pass, CI-friendly)
- `npm run test:watch` → `vitest` (interactive, re-runs on save)
- `src/flashcards/csv.test.js` — 27 tests covering `parseCSV`: delimiter detection (comma + semicolon), all header words, quoted fields, CRLF/LF/CR line endings, filtering, whitespace trimming.
- `docs/decisions/0002-vitest-for-unit-tests.md` — ADR explaining the choice.

## Why Vitest

Native ESM support and zero-config TypeScript via esbuild make it the right pick for the upcoming TS migration. No path mapping or tsconfig changes will be needed when `.js` files become `.ts`.

## Open threads

- No tests yet for the kanban model/storage layer (`src/model/`, `src/storage/`). Storage tests need a real file or a mock of the File System Access API — defer until TS migration shapes the approach.
- Consider adding Vitest to CI (GitHub Actions workflow already exists for Pages deploy).
