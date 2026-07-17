import {
  fsSupported, pickDirectory, storedDirHandle,
  hasPermission, requestPermission,
  scanTree, readFile, writeFile, createNote, deleteNote,
  readConfig, writeConfig,
} from "./fs.js";
import { init as initTree, renderTree, renderRecent, setSelected } from "./tree.js";
import { renderMarkdown } from "./md.js";

const MAX_RECENT = 5;

const $ = (id) => document.getElementById(id);

const el = {
  welcome:      $("nt-welcome"),
  welcomeMsg:   $("nt-welcome-msg"),
  pickBtn:      $("nt-pick-btn"),
  topbar:       $("nt-topbar"),
  folderName:   $("nt-folder-name"),
  status:       $("nt-status"),
  newNoteBtn:   $("nt-new-note-btn"),
  app:          $("nt-app"),
  sidebarTitle: $("nt-sidebar-title"),
  recent:       $("nt-recent"),
  tree:         $("nt-tree"),
  noteTitle:    $("nt-note-title"),
  deleteBtn:    $("nt-delete-btn"),
  editorBody:   $("nt-editor-body"),
  textarea:     $("nt-textarea"),
  divider:      $("nt-divider"),
  preview:      $("nt-preview"),
  refreshBtn:   $("nt-refresh-btn"),
};

let root = null;
let config = {};
let currentPath = null;
let saveTimer = null;
let statusTimer = null;
let dirty = false;

// ---- boot ----

async function boot() {
  if (!fsSupported()) {
    el.welcomeMsg.textContent =
      "Notes requires a Chromium browser (Chrome, Arc, Edge, Brave).";
    el.pickBtn.disabled = true;
    return;
  }

  const stored = await storedDirHandle();
  if (stored && (await hasPermission(stored))) {
    await loadRoot(stored);
    return;
  }

  el.pickBtn.addEventListener("click", async () => {
    el.pickBtn.disabled = true;
    try {
      const s = await storedDirHandle();
      if (s && (await requestPermission(s))) {
        await loadRoot(s);
      } else {
        await loadRoot(await pickDirectory());
      }
    } catch (e) {
      if (e.name !== "AbortError") console.error(e);
      el.pickBtn.disabled = false;
    }
  });
}

async function loadRoot(handle) {
  root = handle;
  config = await readConfig(handle);

  // Restore split ratio before showing the app
  if (config.splitPct) el.textarea.style.width = config.splitPct + "%";

  initTree(onNoteSelect);
  await refreshTree();
  renderRecents();

  el.folderName.textContent = handle.name;
  el.sidebarTitle.textContent = handle.name;
  el.welcome.classList.add("hidden");
  el.topbar.classList.remove("hidden");
  el.app.classList.remove("hidden");

  if (config.lastOpen) {
    try {
      await onNoteSelect(config.lastOpen);
    } catch {
      // file was deleted or moved externally
    }
  }
}

async function refreshTree() {
  const tree = await scanTree(root);
  renderTree(tree, el.tree);
  if (currentPath) setSelected(currentPath);
}

// ---- note selection ----

function addToRecent(path) {
  const prev = config.recent ?? [];
  config.recent = [path, ...prev.filter((p) => p !== path)].slice(0, MAX_RECENT);
}

function renderRecents() {
  renderRecent(config.recent ?? [], el.recent, onNoteSelect);
}

async function onNoteSelect(path) {
  await flushSave();

  currentPath = path;
  dirty = false;
  addToRecent(path);
  renderRecents();
  setSelected(path);
  el.noteTitle.textContent = path.split("/").pop().replace(/\.md$/, "");
  el.deleteBtn.style.display = "";

  try {
    const content = await readFile(root, path);
    el.textarea.value = content;
    el.textarea.disabled = false;
    el.textarea.focus();
    el.preview.innerHTML = renderMarkdown(content);
    setStatus("", false);
  } catch {
    setStatus("Could not open file", true);
  }

  config.lastOpen = path;
  writeConfig(root, config); // fire-and-forget
}

// ---- auto-save + live preview ----

el.textarea.addEventListener("input", () => {
  dirty = true;
  setStatus("", false);
  el.preview.innerHTML = renderMarkdown(el.textarea.value);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 750);
});

async function save() {
  if (!currentPath || !dirty) return;
  try {
    await writeFile(root, currentPath, el.textarea.value);
    dirty = false;
    setStatus("Saved", false);
  } catch {
    setStatus("Save failed", true);
  }
}

async function flushSave() {
  clearTimeout(saveTimer);
  await save();
}

// ---- split drag ----

let dragging = false;
let dragStartX = 0;
let dragStartW = 0;

el.divider.addEventListener("mousedown", (e) => {
  dragging = true;
  dragStartX = e.clientX;
  dragStartW = el.textarea.offsetWidth;
  document.documentElement.classList.add("resizing");
  e.preventDefault();
});

document.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const total = el.editorBody.offsetWidth;
  const newW = dragStartW + (e.clientX - dragStartX);
  const pct = Math.max(20, Math.min(80, (newW / total) * 100));
  el.textarea.style.width = pct + "%";
  config.splitPct = pct;
});

document.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  document.documentElement.classList.remove("resizing");
  writeConfig(root, config); // persist split
});

// ---- delete ----

el.deleteBtn.addEventListener("click", async () => {
  const name = currentPath.split("/").pop().replace(/\.md$/, "");
  if (!confirm(`Delete "${name}"?\n\nThis cannot be undone.`)) return;

  const path = currentPath;
  currentPath = null;
  dirty = false;
  clearTimeout(saveTimer);

  el.textarea.value = "";
  el.textarea.disabled = true;
  el.preview.innerHTML = "";
  el.noteTitle.textContent = "Select a note";
  el.deleteBtn.style.display = "none";

  config.recent = (config.recent ?? []).filter((p) => p !== path);
  delete config.lastOpen;
  renderRecents();

  try {
    await deleteNote(root, path);
    await refreshTree();
    writeConfig(root, config);
  } catch (e) {
    alert("Could not delete note: " + e.message);
  }
});

// ---- actions ----

el.newNoteBtn.addEventListener("click", async () => {
  const name = prompt("Note name:");
  if (!name?.trim()) return;
  const parentPath = currentPath
    ? currentPath.split("/").slice(0, -1).join("/") || null
    : null;
  try {
    const path = await createNote(root, parentPath, name.trim());
    await refreshTree();
    await onNoteSelect(path);
  } catch (e) {
    alert("Could not create note: " + e.message);
  }
});

el.refreshBtn.addEventListener("click", refreshTree);

// ---- helpers ----

function setStatus(msg, isError) {
  el.status.textContent = msg;
  el.status.className =
    "save-status" + (isError ? " err" : msg ? " ok" : "");
  if (msg && !isError) {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      el.status.textContent = "";
      el.status.className = "save-status";
    }, 2000);
  }
}

boot();
