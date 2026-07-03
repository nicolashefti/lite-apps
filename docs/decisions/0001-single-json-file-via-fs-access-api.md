# ADR 0001 — Single JSON file via the File System Access API

**Date:** 2026-07-03 · **Status:** accepted

## Context

Personal, single-user task manager. Requirements: no backend, data ownership, multi-device availability without building sync.

## Decision

Persist all state to one human-readable JSON file chosen by the user (File System Access API, handle persisted in IndexedDB). Cloud sync is delegated to the OS (iCloud/Dropbox folder). Conflicts are detected via `meta.revision` + `meta.deviceId` before every write and resolved by the user — no automatic merging.

## Consequences

- Zero infrastructure; the data outlives the app.
- Chromium-only for the full experience; Safari/Firefox get import/export fallback.
- Sync conflicts are possible but rare (single user); the pre-write conflict gate makes them loud instead of lossy.
- File size is a non-issue at personal scale, so pretty-printed JSON (`null, 2`) is used for diffability.

Full detail: `../task-manager-spec.md`.
