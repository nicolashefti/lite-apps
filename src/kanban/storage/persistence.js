// Load pipeline, debounced save queue and pre-write conflict gate (spec §5–§6).
//
// Invariants enforced here:
// - Saves are queued, never concurrent: a save in flight coalesces further
//   requests into one trailing save.
// - Every write is preceded by a re-read of the file; a revision/deviceId
//   mismatch is surfaced to the user, never silently clobbered.
// - On write failure the in-memory data stays authoritative and we retry
//   with backoff (1s, 5s, 15s).

import {
  validate,
  repair,
  needsMigration,
  applyMigrations,
  nowIso,
  APP_VERSION,
} from "../model/schema.js";
import { store, setData } from "../model/store.js";
import { idbSet, KEY_DATA_FILE } from "./fileHandle.js";
import { preMigrationBackup } from "./backups.js";

const DEBOUNCE_MS = 750;
const RETRY_DELAYS = [1000, 5000, 15000];

let handle = null;
let deviceId = null;
let lastLoaded = null; // { revision, deviceId, fileLastModified }
let debounceTimer = null;
let saving = false;
let saveQueued = false;
let retryCount = 0;
let dirty = false;

// Wired by main.js.
export const hooks = {
  onStatus: () => {}, // "saving" | "saved" | "error"
  onConflict: async () => "reload", // resolves "reload" | "overwrite" | "copy"
  onExternalReload: () => {},
};

export function init({ fileHandle, id }) {
  handle = fileHandle;
  deviceId = id;
}

export function isDirty() {
  return dirty;
}

// Shared parse → validate → migrate → repair pipeline (spec §5.1).
export async function prepareData(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error(
      "The file is not valid JSON — it may be corrupted. Try opening a backup instead; the original will not be overwritten."
    );
    err.code = "PARSE";
    throw err;
  }
  validate(data);
  if (needsMigration(data)) {
    await preMigrationBackup(text, data.schemaVersion);
    data = applyMigrations(data);
  }
  repair(data);
  return data;
}

export async function loadFromHandle(h) {
  handle = h;
  const file = await h.getFile();
  const data = await prepareData(await file.text());
  lastLoaded = {
    revision: data.meta.revision,
    deviceId: data.meta.deviceId,
    fileLastModified: file.lastModified,
  };
  dirty = false;
  return data;
}

export function scheduleSave() {
  dirty = true;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(save, DEBOUNCE_MS);
}

// Best-effort force save (visibilitychange → hidden, beforeunload).
export function flushSave() {
  clearTimeout(debounceTimer);
  if (dirty) return save();
}

async function save() {
  if (!handle || !store.data) return;
  if (saving) {
    saveQueued = true;
    return;
  }
  saving = true;
  hooks.onStatus("saving");
  try {
    if (await conflictGate()) {
      store.data.meta.revision += 1;
      store.data.meta.updatedAt = nowIso();
      store.data.meta.deviceId = deviceId;
      store.data.meta.appVersion = APP_VERSION;
      // createWritable writes to a temp file and swaps atomically on close().
      const w = await handle.createWritable();
      await w.write(JSON.stringify(store.data, null, 2));
      await w.close();
      const file = await handle.getFile();
      lastLoaded = {
        revision: store.data.meta.revision,
        deviceId,
        fileLastModified: file.lastModified,
      };
      dirty = false;
      retryCount = 0;
    }
    hooks.onStatus("saved");
  } catch (err) {
    console.error("[save] failed:", err);
    hooks.onStatus("error");
    const delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
    retryCount += 1;
    setTimeout(() => {
      if (dirty) save();
    }, delay);
  } finally {
    saving = false;
    if (saveQueued) {
      saveQueued = false;
      save();
    }
  }
}

// Pre-write conflict check (spec §6). Returns true when writing is safe.
async function conflictGate() {
  // Fresh file we just created, or a file the user explicitly chose to
  // overwrite in the save picker — nothing to protect yet.
  if (!lastLoaded) return true;

  const file = await handle.getFile(); // NotFoundError propagates to retry path
  if (file.lastModified === lastLoaded.fileLastModified) return true;
  const text = await file.text();
  if (text.trim() === "") return true;

  let disk;
  try {
    disk = JSON.parse(text);
  } catch {
    throw new Error("Data file on disk is unreadable — refusing to overwrite it.");
  }
  if (
    disk?.meta?.revision === lastLoaded.revision &&
    disk?.meta?.deviceId === lastLoaded.deviceId
  ) {
    return true;
  }

  // The file changed under us (another device synced in). Ask the user.
  const choice = await hooks.onConflict();
  if (choice === "overwrite") return true;

  if (choice === "reload") {
    const data = await loadFromHandle(handle);
    setData(data);
    hooks.onExternalReload(data);
    return false;
  }

  // "copy": write my version next to the original and keep working on the
  // copy, leaving the synced file to the other device's version.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const copyHandle = await window.showSaveFilePicker({
    suggestedName: `tasks.conflict-${stamp}.json`,
    types: [{ description: "JSON file", accept: { "application/json": [".json"] } }],
  });
  handle = copyHandle;
  await idbSet(KEY_DATA_FILE, copyHandle);
  lastLoaded = null;
  return true;
}

// On window focus / visible (spec §6): if the file moved ahead and we have no
// unsaved local changes, reload silently — the "other laptop" case.
export async function checkExternalChange() {
  if (!handle || !lastLoaded || saving || dirty) return;
  try {
    const file = await handle.getFile();
    if (file.lastModified === lastLoaded.fileLastModified) return;
    const disk = JSON.parse(await file.text());
    if (
      disk?.meta?.revision !== lastLoaded.revision ||
      disk?.meta?.deviceId !== lastLoaded.deviceId
    ) {
      const data = await loadFromHandle(handle);
      setData(data);
      hooks.onExternalReload(data);
    }
  } catch {
    // Unreadable right now (mid-sync?) — the next save's conflict gate handles it.
  }
}
