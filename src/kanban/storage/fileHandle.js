// File System Access API handle lifecycle (spec §4).
// Handles are structured-cloneable, so they persist in IndexedDB —
// localStorage cannot hold them.

const DB_NAME = "kanban-lite";
const STORE = "handles";

export const KEY_DATA_FILE = "dataFile";
export const KEY_BACKUP_DIR = "backupDir";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const idbGet = (key) => tx("readonly", (s) => s.get(key));
export const idbSet = (key, value) => tx("readwrite", (s) => s.put(value, key));
export const idbDelete = (key) => tx("readwrite", (s) => s.delete(key));

export function fsSupported() {
  return typeof window.showOpenFilePicker === "function";
}

const JSON_TYPE = { description: "JSON file", accept: { "application/json": [".json"] } };

export async function pickNewFile() {
  const handle = await window.showSaveFilePicker({
    suggestedName: "tasks.json",
    types: [JSON_TYPE],
  });
  await idbSet(KEY_DATA_FILE, handle);
  return handle;
}

export async function pickExistingFile() {
  const [handle] = await window.showOpenFilePicker({ types: [JSON_TYPE] });
  await idbSet(KEY_DATA_FILE, handle);
  return handle;
}

export function storedFileHandle() {
  return idbGet(KEY_DATA_FILE);
}

export async function hasPermission(handle) {
  return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
}

// Must be called from a user gesture.
export async function requestPermission(handle) {
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}
