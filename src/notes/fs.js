// File System Access API — directory handle lifecycle and file operations.

const DB_NAME = "notes-app";
const STORE = "handles";
const KEY_DIR = "rootDir";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbTx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const idbGet = (key) => idbTx("readonly", (s) => s.get(key));
const idbSet = (key, val) => idbTx("readwrite", (s) => s.put(val, key));

export const fsSupported = () => typeof window.showDirectoryPicker === "function";

export async function pickDirectory() {
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  await idbSet(KEY_DIR, handle);
  return handle;
}

export const storedDirHandle = () => idbGet(KEY_DIR);

export const hasPermission = async (h) =>
  (await h.queryPermission({ mode: "readwrite" })) === "granted";

export const requestPermission = async (h) =>
  (await h.requestPermission({ mode: "readwrite" })) === "granted";

async function navigate(root, segments) {
  let cur = root;
  for (const seg of segments) cur = await cur.getDirectoryHandle(seg);
  return cur;
}

// Returns sorted tree: dirs first (alpha), then files (alpha). Skips hidden + config files.
export async function scanTree(dirHandle, basePath = "") {
  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith(".") || name === "_notes.config.json") continue;
    const path = basePath ? `${basePath}/${name}` : name;
    if (handle.kind === "directory") {
      const children = await scanTree(handle, path);
      entries.push({ name, path, kind: "directory", children });
    } else {
      entries.push({ name, path, kind: "file", nonMd: !name.endsWith(".md") });
    }
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export async function buildIndex(rootHandle, nodes) {
  const index = new Map();
  async function walk(ns) {
    for (const node of ns) {
      if (node.kind === "directory") {
        await walk(node.children);
      } else if (!node.nonMd) {
        try {
          index.set(node.path, await readFile(rootHandle, node.path));
        } catch { /* removed between scan and index build — skip */ }
      }
    }
  }
  await walk(nodes);
  return index;
}

export async function readFile(rootHandle, path) {
  const segs = path.split("/");
  const name = segs.pop();
  const dir = segs.length ? await navigate(rootHandle, segs) : rootHandle;
  const fh = await dir.getFileHandle(name);
  return (await fh.getFile()).text();
}

export async function writeFile(rootHandle, path, content) {
  const segs = path.split("/");
  const name = segs.pop();
  const dir = segs.length ? await navigate(rootHandle, segs) : rootHandle;
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(content);
  await w.close();
}

export async function deleteNote(rootHandle, path) {
  const segs = path.split("/");
  const name = segs.pop();
  const dir = segs.length ? await navigate(rootHandle, segs) : rootHandle;
  await dir.removeEntry(name);
}

export async function createNote(rootHandle, parentPath, name) {
  const safeName = name.endsWith(".md") ? name : `${name}.md`;
  const dir = parentPath ? await navigate(rootHandle, parentPath.split("/")) : rootHandle;
  // create: true is a no-op if the file already exists — safe to call
  await dir.getFileHandle(safeName, { create: true });
  return parentPath ? `${parentPath}/${safeName}` : safeName;
}

// Small JSON in root: persists last-open path and other UI prefs.
const CONFIG = "_notes.config.json";

export async function readConfig(rootHandle) {
  try {
    const fh = await rootHandle.getFileHandle(CONFIG);
    return JSON.parse(await (await fh.getFile()).text());
  } catch {
    return {};
  }
}

export async function writeConfig(rootHandle, cfg) {
  const fh = await rootHandle.getFileHandle(CONFIG, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(cfg));
  await w.close();
}
