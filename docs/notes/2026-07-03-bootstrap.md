# 2026-07-03 — Project bootstrapped

Initial implementation of the full spec (`docs/task-manager-spec.md`) in vanilla ES modules, no dependencies, no build step.

## State

- All spec sections implemented: load/validate/repair pipeline, debounced save queue with coalescing, pre-write conflict gate with 3-way modal, silent reload on focus, daily rolling backups (keep 14), migration scaffold (empty — schema is still v1), Safari/Firefox fallback mode.
- UI: board with drag & drop, task editor modal (notes, priority, due date, tags, subtasks, status), list rename/delete.

## Known gaps / open threads

- No automated tests — storage code is only covered by the `/smoke-test` manual checklist.
- `beforeunload` flush is best-effort only (async write may not finish); acceptable per spec §5.2.
- Conflict "save mine as a copy" switches the working handle to the copy — reasonable reading of spec §6, revisit if it feels wrong in practice.
- Undo stack (in-memory) mentioned by spec §2.3 as optional — not implemented.
- List archiving exists in the data model but has no UI yet.

## Parked ideas (v2 per spec §9)

Encryption at rest (WebCrypto + passphrase), recurring tasks (`recurrence` field reserved), attachments.
