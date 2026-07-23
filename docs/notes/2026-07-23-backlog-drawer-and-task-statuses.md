# 2026-07-23 — Backlog drawer + Delegated/Blocked statuses

## Changes made

### Backlog drawer (first list as collapsible full-width panel)

The first list in `visibleLists()` (lowest `order`, always the Inbox) now renders as a full-width collapsible drawer instead of a regular column.

**Motivation**: the backlog is long and creates an "overwhelmed" feeling when visible by default. Hiding it lets users focus on the active columns.

**Key decisions**:
- Drawer is **collapsed by default**; open state is session-only (`let drawerOpen` module variable in `board.js` — same pattern as project expansion state in `projects.js`).
- When open, cards display in a **CSS grid** (`repeat(auto-fill, 280px)`) for a compact multi-column layout.
- The `add-input` is hidden when collapsed; appears when drawer is open.
- Clicking anywhere in the header (except the list name h2) toggles the drawer. The h2 still dblclick-renames as before.
- `_boardRoot` module variable captures the board root on first `renderBoard()` call so the toggle can re-render without DOM traversal.

**Layout change**: `.board` became `flex-direction: column`. A new `.columns-row` div wraps remaining columns and carries the `overflow-x: auto` that was previously on `.board`.

**Files changed**: `src/kanban/ui/board.js`, `styles.css`.

### Delegated and Blocked task statuses

Two new values added to the `status` field: `"delegated"` and `"blocked"`.

- **Delegated**: I track this task but I'm not the one doing it — someone else owns execution.
- **Blocked**: The task is stuck waiting on a condition; needs a periodic check, not active work.

**No schema migration needed** — `status` is a free string; `fillTaskDefaults` uses `??=` (only sets if missing). New values round-trip untouched through the repair pass.

**UI treatment**:
- Cards get a colored left border: teal (`#6BC5D2`) for delegated, amber (`#F2C14E`) for blocked.
- A small colored badge (`status-badge`) appears first in the card meta row: "Delegated" (teal) or "Blocked" (amber).
- The open-task count in column/drawer headers counts only `status === "open"` — delegated/blocked are monitoring states, not active work.

**Files changed**: `src/kanban/ui/taskModal.js` (dropdown options), `src/kanban/ui/board.js` (badge in `cardEl`), `styles.css` (card border + badge styles).

## Open threads

- The ideas file (`docs/ideas/other-apps.md`) mentions "Delegated tasks" as a project-view feature too — a visual distinction in the project task panel for delegated tasks. Not done yet.
- The drawer state (open/closed) resets on page reload. If this becomes annoying, persist it to `localStorage` under a `ptm.ui.*` key (matches the invariant that localStorage holds UI prefs only).
