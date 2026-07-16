# 2026-07-16 — Board filter + project status removal

## Changes made

### Board: hide tasks from archived projects
- `src/kanban/ui/board.js` `columnEl()` now filters `tasksInList()` results to exclude tasks whose `projectId` points to an archived project. Orphan tasks (`projectId: null`) are always shown.
- The project view (`projects.js` `taskPanel`) intentionally keeps showing all tasks regardless of archive status — no filter applied there.

### Project status field removed from UI
- The `status` field (`poc`/`mvp`/`run`) is gone from the project card UI (`src/kanban/ui/projects.js`).
- The field still exists in the data model and round-trips through saves untouched — no migration needed.
- `PROJECT_STATUSES` / `PROJECT_STATUS_LABELS` imports removed from `projects.js`.
- CSS grid in `styles.css` `.project-row` dropped from 6 to 5 columns (removed the `92px` status column). Current columns: caret, name, completion, add-input, archive button.
