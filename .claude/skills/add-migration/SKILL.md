---
name: add-migration
description: Add a schema migration when the JSON data format changes in a breaking way
---

# Add a schema migration

Follow spec §2.5 (`docs/task-manager-spec.md`). All changes happen in `src/model/schema.js`.

1. Decide whether the change is actually breaking. Additive optional fields are **not** breaking — the repair pass fills defaults and unknown keys round-trip; no migration needed.
2. Bump `SCHEMA_VERSION` (N → N+1).
3. Add an entry to the `migrations` map keyed by the **old** version:
   ```js
   export const migrations = {
     1: (data) => {
       // transform v1 → v2 in place, return data
       return data;
     },
   };
   ```
   Do not set `schemaVersion` inside the step — `applyMigrations` does that.
4. Update defaults: `createEmptyData` / `createTask` / `createList` must produce the new shape directly, and `repair()` must fill the new field's default for safety.
5. Update the spec (`docs/task-manager-spec.md` §2) and record the change in `docs/notes/`.
6. Verify the pre-migration backup path: on load of an old file, `preMigrationBackup` must fire **before** the migration runs (already wired in `persistence.prepareData`).
7. Manual test: craft an old-version file by hand, open it, confirm (a) a `tasks.pre-migration-v<N>-*.json` backup lands in the backup folder, (b) data migrates correctly, (c) a file with `schemaVersion` **greater** than current is rejected with the "newer version" message.
