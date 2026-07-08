# Kanban Lite

Personal kanban/task manager. Fully client-side static SPA — vanilla JS, ES modules, **zero dependencies, no build step**. All state lives in one user-chosen JSON file accessed through the File System Access API; cloud sync (iCloud/Dropbox) is handled by the OS, invisible to the app.

The source-of-truth specification is `docs/task-manager-spec.md`. When behavior questions come up, the spec wins.

## Run / test

```sh
python3 -m http.server 8000   # ES modules need http://; file:// will not work
```

Open http://localhost:8000 in a Chromium browser (Chrome, Edge, Arc, Brave). Safari/Firefox get a degraded import/export fallback. There is no automated test suite yet — use the `/smoke-test` checklist after touching storage code.

## Architecture

One folder per app under `src/`; shared utilities live in `src/shared/`.

### Kanban (`src/kanban/`)

| Path | Role |
|---|---|
| `src/kanban/model/schema.js` | Format constants, defaults, validation, repair pass, migrations map |
| `src/kanban/model/store.js` | In-memory store; **all** mutations go through `mutate()` |
| `src/kanban/storage/fileHandle.js` | Pickers, permissions, IndexedDB handle persistence |
| `src/kanban/storage/persistence.js` | Load pipeline, 750 ms debounced save queue, pre-write conflict gate |
| `src/kanban/storage/backups.js` | Daily rolling backups (keep 14), pre-migration backups |
| `src/kanban/ui/` | Vanilla DOM; full board re-render on every store change |
| `src/kanban/main.js` | Boot, screen switching, event wiring, fallback mode |

### Flashcards (`src/flashcards/`)

| Path | Role |
|---|---|
| `src/flashcards/csv.js` | RFC 4180 CSV parser with auto-delimiter detection (`,` or `;`) |
| `src/flashcards/main.js` | Deck state, flip/navigate, keyboard + swipe controls |

### Shared (`src/shared/`)

Empty for now. Intended home for utilities needed by more than one app (e.g. `escapeHtml`, `shortId`).

## Invariants — do not break

- Never write the data file without the pre-write conflict check in `persistence.js` (`conflictGate`). Never silently clobber newer data.
- Unknown JSON keys must round-trip untouched (forward compatibility): mutate the loaded object in place; never rebuild the data object from scratch.
- All state changes go through `store.mutate()`; UI code never assigns to `store.data` directly.
- The `"inbox"` list always exists and cannot be deleted.
- A task belongs to exactly one project via `projectId`, or `null` = the virtual "Orphans" project. Orphans is UI-only, never stored in the file; unknown project ids are nulled by the repair pass. Project completion is derived from tasks, never stored.
- Saves are queued, never concurrent; in-flight saves coalesce trailing requests.
- `localStorage` holds only the device ID, backup date and UI prefs — never task data. File handles live in IndexedDB.
- Tasks are hard-deleted. No tombstones in the file; undo (if ever added) is in-memory only.
- On save failure, in-memory data stays authoritative; retry with 1s/5s/15s backoff.

## Conventions

- Keep it vanilla: no frameworks, no npm, no bundler, unless the user explicitly decides otherwise (record such a decision in `docs/decisions/`).
- Schema changes must bump `SCHEMA_VERSION` and add a migration — use the `/add-migration` skill.
- Comments explain constraints/spec references, not what the code does.

## Working memory for AI sessions

- `docs/notes/` — durable working memory: session notes, known issues, TODO scratchpad. **Read it at the start of a session; update it when you learn something durable** (gotchas, decisions in flight, open threads).
- `docs/decisions/` — ADRs for non-obvious architectural choices. Add one whenever a choice would surprise a future reader.
- `.claude/skills/` — repeatable procedures (`add-migration`, `smoke-test`).
