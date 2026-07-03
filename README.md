# Kanban Lite

A personal kanban task manager that lives entirely in your browser and stores everything in **one JSON file you own**. Drop that file in iCloud Drive or Dropbox and your tasks follow you across machines — no account, no server, no tracking.

## Features

- Kanban board with lists, drag & drop, priorities, due dates, tags and subtasks
- Autosave (750 ms debounce) straight to your file via the File System Access API — atomic writes, no torn files
- Cloud-sync safe: before every write the app re-checks the file and warns you if another device changed it (never silently overwrites)
- Daily rolling backups (last 14 kept) into a folder you choose
- Human-readable, diff-friendly JSON — your data is never locked in

## Quick start

No build step. Serve the folder over HTTP (ES modules don't load from `file://`):

```sh
python3 -m http.server 8000
# or: npx serve
```

Open http://localhost:8000, then **Create new file** (put it in a cloud-synced folder if you want sync) or **Open existing file**.

## Browser support

| Browser | Support |
|---|---|
| Chrome / Edge / Arc / Brave | Full (File System Access API) |
| Safari / Firefox | Fallback: open via file picker, save via download button |

## Data & backups

- Everything is stored in the single JSON file you picked. Format spec: [`docs/task-manager-spec.md`](docs/task-manager-spec.md).
- Click **Backups** in the top bar once to choose a backup folder (ideally `backups/` next to your data file). The app then writes `tasks.backup-YYYY-MM-DD.json` once a day and keeps the last 14.
- If a file ever fails to load, it is never overwritten — open a backup instead.

## Project structure

```
index.html, styles.css      app shell
src/model/                  schema, validation, migrations, in-memory store
src/storage/                file handles, save queue + conflict detection, backups
src/ui/                     board, task editor, modals (vanilla DOM)
docs/                       spec, architecture decisions, working notes
.claude/                    AI-assistant skills (see CLAUDE.md)
```

Development conventions and invariants for AI-assisted work live in [`CLAUDE.md`](CLAUDE.md).
