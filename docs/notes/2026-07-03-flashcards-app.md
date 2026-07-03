# 2026-07-03 — Flashcards app added

Second app in the repo. Follows the same principles as Kanban Lite: vanilla JS, ES modules, zero dependencies, no build step.

## Files added

| Path | Role |
|---|---|
| `flashcards.html` | Entry point; links `styles.css`, adds flip-card styles inline |
| `src/flashcards/csv.js` | RFC 4180 CSV parser → `[{front, back}]` |
| `src/flashcards/main.js` | State (deck, cursor, flip), DOM wiring, keyboard shortcuts |
| `example-decks/top-100-english-words.csv` | Demo deck (100 cards, header row auto-skipped) |

`index.html` is now a launcher home page; the original kanban app lives at `kanban.html`.

## Design decisions

- **No metadata in CSV**: deck title is derived from the filename. Last-row sentinel was considered and rejected — spreadsheet apps show it as a regular card. If deck-level config is ever needed, a companion `.json` sidecar (same base name) is the intended path.
- **Header row detection**: if the first row's first cell matches `front / back / question / answer / term / definition / a / b`, it is skipped automatically.
- **Read-only file access**: uses a plain `<input type="file">`, not the File System Access API — no writes ever needed, no IndexedDB handle, no conflict gate. State is in-memory only.
- **CSS reuse**: `styles.css` design tokens (`--accent`, `--surface`, etc.) and utility classes (`button`, `.topbar`, `.hidden`, `.spacer`) are reused. Flashcard-specific classes use the `fc-` prefix to avoid collision with `.card` and other kanban selectors already in `styles.css`.

## Controls

- Click card or Space → flip
- ← → arrow keys or Prev/Next buttons → navigate
- Shuffle button → toggles shuffle mode (blue = on), restarts from card 1
- Restart button → card 1, keeps current shuffle state
- "Load deck" in topbar → pick a new CSV without reloading the page

## Open threads

- No spaced repetition / scoring yet.
- No per-deck progress persistence (localStorage hook is obvious next step).
- No multi-deck management (load one deck at a time).
- `example-decks/` could grow into a small library of demo decks.
