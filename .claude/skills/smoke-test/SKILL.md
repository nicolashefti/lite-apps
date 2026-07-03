---
name: smoke-test
description: Manual test checklist to run after touching storage or persistence code
---

# Smoke test checklist

Serve with `python3 -m http.server 8000`, open http://localhost:8000 in a Chromium browser. Walk the user through (or verify yourself where possible):

## Core flow
- [ ] First run shows welcome; **Create new file** writes a valid `tasks.json` (check `format`, `schemaVersion`, inbox list present).
- [ ] Add a task → "Saving…" then "Saved ✓" within ~1 s; file on disk contains the task, pretty-printed with 2-space indent.
- [ ] Reload the page → board restores without any picker (handle from IndexedDB).
- [ ] Edit title/notes/priority/due/tags/subtasks in the editor; drag a card between lists; each change lands in the file.

## Resilience
- [ ] Edit the file externally (bump `meta.revision`, change `meta.deviceId`), then make a change in the app → conflict modal appears with 3 options; each option behaves as labeled.
- [ ] Edit the file externally, then just refocus the window with no unsaved changes → app reloads silently.
- [ ] Corrupt the file (invalid JSON), reload → clear error, file is **not** overwritten.
- [ ] Change `format` to something else → load refused with format error.
- [ ] Set `schemaVersion: 99` → "newer version" message.
- [ ] Delete/move the file, reload → welcome screen with explanation.
- [ ] Task with unknown `listId` → moved to inbox on load (console shows `[repair]` log).

## Projects (schema v2)
- [ ] Open a schema v1 file → migrates to v2 silently; `tasks.pre-migration-v1-*.json` lands in the backup folder (if configured); all pre-existing tasks appear under "Orphans" in the Projects view.
- [ ] Create a project; add a task from its row → task appears in the lowest-order (leftmost) list on the board with the project chip.
- [ ] Completion updates live: mark tasks done → count and % change; cancelled tasks drop out of both numbers.
- [ ] Change status POC/MVP/Run inline; archive → row moves to the dimmed Archived section, its tasks keep their assignment.
- [ ] Give a task a bogus `projectId` in the file → on load it shows under Orphans (console `[repair]` log).

## Backups
- [ ] Choose a backup folder → `tasks.backup-YYYY-MM-DD.json` appears; second app start same day does not write another.

## Fallback
- [ ] In Safari/Firefox: warning shown, file opens via picker, Download button produces valid JSON.
