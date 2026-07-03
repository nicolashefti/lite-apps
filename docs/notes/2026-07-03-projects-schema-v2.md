# 2026-07-03 — Projects (schema v2)

First real schema migration (v1 → v2): top-level `projects` array, `task.projectId` (nullable). Followed the `/add-migration` skill.

## Decisions made

- **"Orphans" is virtual**: `projectId: null` means orphan; the Orphans project is rendered by the UI only when orphan tasks exist and is never written to the file. Unknown project ids are nulled by the repair pass (mirrors the unknown-`listId` → inbox rule).
- **Completion is derived, not stored** (`done/total`, excluding cancelled tasks) — a stored completion field would go stale.
- Project fields kept lean: `id, name, status (poc|mvp|run), archived, order`. No timestamps, matching the list object style.
- Quick-capture from the project view creates tasks in the lowest-`order` non-archived list.
- Archiving a project hides it from the picker and active view but does not touch its tasks; an archived project stays selectable in the task editor if the task already points to it.

## Follow-up (same day)

- Project rows got an expansion caret: expands a panel of the project's tasks grouped by list (lists in manual order, includes archived lists so nothing is hidden). Expansion state is session-only, in-memory in `src/ui/projects.js` — deliberately not persisted anywhere.

## Open threads

- No "delete project" — archive only (deletion semantics for its tasks not decided; would they orphan?).
- Board has no per-project filter yet — likely the next natural step.
- Project `order` has no drag-to-reorder UI (same as lists).
