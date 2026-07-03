# Personal Task Manager — Data & File Sync Specification

**Version:** 1.0
**Scope:** JSON data format + File System Access API persistence layer for a fully client-side, single-user task manager. The data file lives in a cloud-synced folder (e.g. iCloud Drive); the app itself never talks to any network service.

---

## 1. Architecture Overview

- Static single-page web app (no backend, no build server required at runtime).
- All state persisted to **one JSON file** chosen by the user via the File System Access API.
- The app holds an in-memory copy of the data; every mutation triggers a debounced save back to the file.
- Cloud sync (iCloud/Dropbox folder) is invisible to the app — the OS handles it.

Target browsers: Chromium-based (Chrome, Edge, Arc, Brave). Provide a degraded import/export fallback for Safari/Firefox (see §5.4).

---

## 2. JSON File Format

### 2.1 Top-level structure

```json
{
  "format": "personal-task-manager",
  "schemaVersion": 1,
  "meta": {
    "createdAt": "2026-07-03T10:00:00.000Z",
    "updatedAt": "2026-07-03T14:23:11.412Z",
    "appVersion": "1.0.0",
    "deviceId": "a3f1c9d2",
    "revision": 142
  },
  "settings": {
    "defaultListId": "inbox"
  },
  "lists": [],
  "tasks": []
}
```

| Field | Type | Purpose |
|---|---|---|
| `format` | string | Sanity check that the file belongs to this app. Refuse to load otherwise. |
| `schemaVersion` | integer | Bump on breaking schema changes; run migrations on load (§2.5). |
| `meta.updatedAt` | ISO 8601 UTC | Set on every save. |
| `meta.deviceId` | string | Random ID generated once per browser profile, stored in `localStorage`. Used for conflict detection (§6). |
| `meta.revision` | integer | Monotonic counter, incremented on every save. Used for conflict detection (§6). |

### 2.2 List object

```json
{
  "id": "inbox",
  "name": "Inbox",
  "color": "#5B8DEF",
  "order": 0,
  "archived": false
}
```

- `id`: string, unique. Use `crypto.randomUUID()` except for the built-in `"inbox"`.
- The `"inbox"` list always exists and cannot be deleted.
- `order`: integer for manual sorting of lists.

### 2.3 Task object

```json
{
  "id": "9b2e6c1a-4f3d-4b7e-a1c2-8d9e0f1a2b3c",
  "listId": "inbox",
  "title": "Renew passport",
  "notes": "Bring two photos.\nOffice closes at 16:00.",
  "status": "open",
  "priority": 2,
  "tags": ["admin", "errand"],
  "dueDate": "2026-07-15",
  "createdAt": "2026-07-03T10:12:00.000Z",
  "updatedAt": "2026-07-03T10:12:00.000Z",
  "completedAt": null,
  "order": 3,
  "subtasks": [
    { "id": "c1d2e3f4", "title": "Book appointment", "done": true }
  ]
}
```

Field rules:

| Field | Type | Rules |
|---|---|---|
| `id` | UUID string | `crypto.randomUUID()`. Never reused. |
| `listId` | string | Must reference an existing list; orphans are moved to `"inbox"` on load. |
| `title` | string | Required, non-empty after trim, max 500 chars. |
| `notes` | string | Optional, plain text (newlines allowed), default `""`. |
| `status` | enum | `"open"` \| `"done"` \| `"cancelled"`. |
| `priority` | integer | `0` (none), `1` (low), `2` (medium), `3` (high). Default `0`. |
| `tags` | string[] | Lowercase, trimmed, unique within the task. May be empty. |
| `dueDate` | string \| null | Date-only, `YYYY-MM-DD`, **no time zone** — interpreted as local calendar date. |
| `createdAt` / `updatedAt` | ISO 8601 UTC | `updatedAt` set on every mutation of the task. |
| `completedAt` | ISO 8601 UTC \| null | Set when status becomes `done`, cleared if reopened. |
| `order` | integer | Manual sort position within its list. |
| `subtasks` | array | Optional lightweight checklist; subtask `id` may be a short random string. |

Deletion model: tasks are **hard-deleted** (removed from the array). Keep it simple — this is single-user. If undo is desired, implement it in memory only (undo stack), not in the file.

### 2.4 Validation on load

On file open, validate before accepting:

1. `format === "personal-task-manager"`, else reject with a clear error.
2. `schemaVersion` ≤ current app schema version, else prompt "file was created by a newer version".
3. JSON parses and top-level keys exist; unknown extra keys are **preserved** (read → keep → write back untouched) to stay forward-compatible.
4. Repair pass (non-destructive fixes, logged to console):
   - Tasks with unknown `listId` → reassign to `"inbox"`.
   - Missing optional fields → fill defaults.
   - Duplicate task IDs → keep first, regenerate ID of subsequent duplicates.

### 2.5 Migrations

- Keep a `migrations` map: `{ 1: (data) => data2, ... }` applied sequentially from file's `schemaVersion` up to current.
- After successful migration, write a one-time backup of the pre-migration file (§7) before saving in the new format.

---

## 3. In-Memory Model

- Load once into a plain JS object (the "store").
- All UI reads from the store; all mutations go through a single `mutate(fn)` helper that:
  1. applies the change,
  2. updates `task.updatedAt` and `meta.updatedAt`,
  3. schedules a save (§5.2).
- No IndexedDB, no localStorage for task data (localStorage only for: device ID, last file handle, UI preferences).

---

## 4. File Handle Lifecycle

1. **First run:** show a welcome screen with two buttons — *Create new file* (`showSaveFilePicker`, suggested name `tasks.json`) and *Open existing file* (`showOpenFilePicker`, accept `application/json`).
2. **Persist the handle:** store the `FileSystemFileHandle` in IndexedDB (handles are structured-cloneable; localStorage cannot hold them).
3. **Subsequent runs:** retrieve the handle, call `handle.queryPermission({mode:"readwrite"})`; if not `"granted"`, show a single "Reconnect to your file" button that calls `requestPermission` (must be inside a user gesture).
4. If the file was moved/deleted (`NotFoundError` on read), fall back to the welcome screen with an explanatory message.

---

## 5. Save & Load Behavior

### 5.1 Load

```
open handle → getFile() → text() → JSON.parse → validate → migrate → repair → store
```

Record `lastLoaded = { revision, updatedAt, fileLastModified: file.lastModified }`.

### 5.2 Save (debounced autosave)

- Every mutation schedules a save with a **750 ms debounce**; also force-save on `visibilitychange` → hidden and `beforeunload` (best-effort).
- Save procedure:
  1. Increment `meta.revision`, set `meta.updatedAt`, set `meta.deviceId` to this device.
  2. **Pre-write conflict check** (§6).
  3. `const w = await handle.createWritable(); await w.write(JSON.stringify(data, null, 2)); await w.close();`
     `createWritable` writes to a temp file and atomically swaps on `close()` — no torn writes.
  4. Update `lastLoaded` markers from the freshly written state.
- Serialize with `null, 2` indentation: human-readable, diff-friendly, and negligible size at personal scale.
- Saves must be **queued, never concurrent**: if a save is in flight, coalesce further requests into one trailing save.

### 5.3 Save status UI

Show a subtle indicator: `Saved ✓` / `Saving…` / `⚠ Save failed (retry)`. On failure, retry with backoff (1s, 5s, 15s) and keep the in-memory data authoritative.

### 5.4 Fallback mode (no File System Access API)

If `window.showOpenFilePicker` is undefined:
- Load via `<input type="file">`, keep data in memory.
- "Save" button triggers a download of `tasks.json` (Blob + anchor click).
- Warn the user that autosave is unavailable in this browser.

---

## 6. Conflict Detection (cloud-sync safety)

The app cannot prevent iCloud conflicts, but it must never silently clobber newer data.

**Before every write:**

1. Re-read the file's current content (cheap at this size).
2. Compare its `meta.revision` + `meta.deviceId` against `lastLoaded`.
3. Cases:
   - **Match** → safe, proceed with write.
   - **File is ahead and from another device** → the file changed under us (another machine synced in). Pause autosave and show a modal: *"The file was modified elsewhere."* Options:
     - **Reload file** (discard unsaved in-memory changes since last save — usually ≤ 750 ms of edits),
     - **Overwrite** (keep my version),
     - **Save mine as a copy** (write `tasks.conflict-<timestamp>.json` next to the original via `showSaveFilePicker` fallback).
   - **File unreadable/missing** → surface error, do not write blindly.

**On window focus / `visibilitychange` → visible:** re-read the file; if it's ahead of `lastLoaded` and there are no unsaved local changes, reload silently. This makes the "edited on the other laptop yesterday" case seamless.

Single-device usage never hits the modal; it exists purely as a guardrail.

---

## 7. Backups

- On app start (once per calendar day, tracked in localStorage): write a rolling backup.
- Ask the user once for a **backup directory handle** (`showDirectoryPicker`), ideally a `backups/` folder next to the data file; persist the handle in IndexedDB.
- Backup filename: `tasks.backup-YYYY-MM-DD.json`.
- Retention: keep the **last 14** backups; delete older ones from that directory.
- Also write an immediate backup before any schema migration (§2.5), named `tasks.pre-migration-v<N>-<timestamp>.json`.
- If the user declines backups, degrade gracefully and show a small reminder in settings.

---

## 8. Error Handling Summary

| Situation | Behavior |
|---|---|
| JSON parse error on load | Refuse to load; offer to open a backup. Never auto-overwrite a corrupt file. |
| Permission revoked | Prompt reconnect button (user gesture required). |
| File moved/deleted | Welcome screen with explanation. |
| Write fails (e.g. iCloud file evicted/locked) | Retry with backoff; keep memory authoritative; red status indicator. |
| Conflict detected | Modal per §6 — never silent overwrite. |

---

## 9. Non-Goals (v1)

- No multi-user collaboration, no merging of concurrent edits (conflict = user chooses).
- No encryption at rest (the file inherits the cloud provider's protection). Could be a v2 option (WebCrypto + passphrase).
- No attachments/files inside tasks.
- No recurring tasks (v2 candidate: `recurrence` field reserved).

---

## 10. Suggested Module Breakdown (for implementation)

```
src/
  storage/
    fileHandle.js     // pick/persist/reconnect handles (IndexedDB)
    persistence.js    // load, validate, migrate, debounced save queue, conflict check
    backups.js        // daily rolling backups
  model/
    schema.js         // constants, defaults, validators, migrations map
    store.js          // in-memory store + mutate() helper
  ui/                 // whatever framework/vanilla you choose
```
