# 0002 — Vitest for unit tests

**Date:** 2026-07-08  
**Status:** Accepted

## Context

The project started with zero dependencies and no test suite. A manual `/smoke-test` checklist covers storage code; logic like the CSV parser had no automated coverage.

The next step is a TypeScript migration. Choosing a test framework now means picking one that will still work after that migration without reconfiguration.

Candidates considered:

| Option | ESM support | TS support | Notes |
|---|---|---|---|
| `node:test` (built-in) | ✓ | Needs `tsx`/`ts-node` | Minimal output, weaker TS story |
| Jest | Config-heavy | Needs `ts-jest` or Babel | Historical baggage with ESM |
| **Vitest** | Native | via esbuild, zero config | Vite-based; Jest-compatible API |

## Decision

Use **Vitest** as the sole test runner.

- `"type": "module"` in `package.json` keeps the existing ES module imports working unchanged.
- Vitest resolves `.js` imports in the same way browsers do, so no path mapping is needed.
- When TypeScript is added, Vitest transforms `.ts` files via esbuild automatically — no `tsconfig` changes required for tests.
- The `describe`/`it`/`expect` API is identical to Jest, so any future Jest-specific tooling (e.g. IDE plugins) can still be adopted.

## Consequences

- `node_modules/` and `package.json` are now present in the repo. The app itself still has zero runtime dependencies and no build step.
- `npm test` runs all tests once; `npm run test:watch` re-runs on save during development.
- A `.gitignore` entry for `node_modules` should be added if not already present.
