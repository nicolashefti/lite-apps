import {
  fsSupported, pickDirectory, storedDirHandle,
  hasPermission, requestPermission,
  scanTree, readFile, writeFile, createNote, deleteNote,
  readConfig, writeConfig, buildIndex,
} from "./fs.js";
import { init as initTree, renderTree, renderRecent, renderSearchResults, setSelected } from "./tree.js";
import { renderMarkdown } from "./md.js";
import { injectHomeLink } from "../shared/homeLink.js";

const MAX_RECENT = 5;

const $ = (id) => document.getElementById(id);

const el = {
  welcome:       $("nt-welcome"),
  welcomeMsg:    $("nt-welcome-msg"),
  pickBtn:       $("nt-pick-btn"),
  topbar:        $("nt-topbar"),
  folderName:    $("nt-folder-name"),
  status:        $("nt-status"),
  newNoteBtn:        $("nt-new-note-btn"),
  switchFolderBtn:   $("nt-switch-folder-btn"),
  searchInput:   $("nt-search"),
  app:           $("nt-app"),
  sidebar:       $("nt-sidebar"),
  sidebarResize: $("nt-sidebar-resize"),
  sidebarTitle:  $("nt-sidebar-title"),
  recent:        $("nt-recent"),
  tree:          $("nt-tree"),
  noteTitle:     $("nt-note-title"),
  deleteBtn:     $("nt-delete-btn"),
  editorBody:    $("nt-editor-body"),
  textarea:      $("nt-textarea"),
  divider:       $("nt-divider"),
  preview:       $("nt-preview"),
  refreshBtn:    $("nt-refresh-btn"),
};

let root = null;
let config = {};
let currentPath = null;
let saveTimer = null;
let statusTimer = null;
let dirty = false;
let lastTree = [];
let index = null;
let indexToken = 0;
let searchDebounce = null;

injectHomeLink(el.topbar);

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

  if (config.splitPct) el.textarea.style.width = config.splitPct + "%";
  if (config.sidebarWidth) el.sidebar.style.width = config.sidebarWidth + "px";

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

function collectPaths(nodes, out = new Set()) {
  for (const node of nodes) {
    if (node.kind === "file") out.add(node.path);
    else if (node.children) collectPaths(node.children, out);
  }
  return out;
}

async function refreshTree() {
  const tree = await scanTree(root);
  lastTree = tree;

  const q = el.searchInput.value.trim();
  if (q) {
    runSearch(q);
  } else {
    renderTree(tree, el.tree);
    if (currentPath) setSelected(currentPath);
  }

  const existing = collectPaths(tree);
  const before = (config.recent ?? []).length;
  config.recent = (config.recent ?? []).filter((p) => existing.has(p));
  if (config.recent.length !== before) {
    renderRecents();
    writeConfig(root, config);
  }

  rebuildIndex();
}

async function rebuildIndex() {
  const token = ++indexToken;
  index = null;
  const built = await buildIndex(root, lastTree);
  if (token !== indexToken) return; // superseded by a newer refresh
  index = built;
  const q = el.searchInput.value.trim();
  if (q) runSearch(q); // re-render with full-text results now available
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
  el.noteTitle.title = "Double-click to rename";
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
    if (index) index.set(currentPath, el.textarea.value);
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

let sidebarDragging = false;
let sidebarDragStartX = 0;
let sidebarDragStartW = 0;

el.sidebarResize.addEventListener("mousedown", (e) => {
  sidebarDragging = true;
  sidebarDragStartX = e.clientX;
  sidebarDragStartW = el.sidebar.offsetWidth;
  document.documentElement.classList.add("resizing-sidebar");
  e.preventDefault();
});

document.addEventListener("mousemove", (e) => {
  if (dragging) {
    const total = el.editorBody.offsetWidth;
    const newW = dragStartW + (e.clientX - dragStartX);
    const pct = Math.max(20, Math.min(80, (newW / total) * 100));
    el.textarea.style.width = pct + "%";
    config.splitPct = pct;
  }
  if (sidebarDragging) {
    const newW = sidebarDragStartW + (e.clientX - sidebarDragStartX);
    const clamped = Math.max(140, Math.min(400, newW));
    el.sidebar.style.width = clamped + "px";
    config.sidebarWidth = clamped;
  }
});

document.addEventListener("mouseup", () => {
  if (dragging) {
    dragging = false;
    document.documentElement.classList.remove("resizing");
    writeConfig(root, config);
  }
  if (sidebarDragging) {
    sidebarDragging = false;
    document.documentElement.classList.remove("resizing-sidebar");
    writeConfig(root, config);
  }
});

// ---- rename ----

el.noteTitle.addEventListener("dblclick", () => {
  if (!currentPath) return;
  const currentName = currentPath.split("/").pop().replace(/\.md$/, "");

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.className = "nt-rename-input";
  el.noteTitle.replaceWith(input);
  input.select();

  let done = false;

  async function commit() {
    if (done) return;
    done = true;
    input.replaceWith(el.noteTitle);

    const newName = input.value.trim();
    if (!newName || newName === currentName) return;

    await flushSave();
    const segs = currentPath.split("/");
    segs.pop();
    const dirPath = segs.join("/") || null;
    const newFileName = newName.endsWith(".md") ? newName : `${newName}.md`;
    const newPath = dirPath ? `${dirPath}/${newFileName}` : newFileName;

    try {
      const content = await readFile(root, currentPath);
      await writeFile(root, newPath, content);
      await deleteNote(root, currentPath);

      config.recent = (config.recent ?? []).map((p) => (p === currentPath ? newPath : p));
      if (config.lastOpen === currentPath) config.lastOpen = newPath;
      currentPath = newPath;
      el.noteTitle.textContent = newName;

      renderRecents();
      await refreshTree();
      setSelected(newPath);
      writeConfig(root, config);
    } catch (e) {
      alert("Could not rename: " + e.message);
    }
  }

  function cancel() {
    if (done) return;
    done = true;
    input.replaceWith(el.noteTitle);
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") cancel();
  });
  input.addEventListener("blur", commit);
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
  el.noteTitle.title = "";
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

el.switchFolderBtn.addEventListener("click", async () => {
  try {
    await flushSave();
    currentPath = null;
    dirty = false;
    clearTimeout(saveTimer);
    el.textarea.value = "";
    el.textarea.disabled = true;
    el.preview.innerHTML = "";
    el.noteTitle.textContent = "Select a note";
    el.noteTitle.title = "";
    el.deleteBtn.style.display = "none";
    await loadRoot(await pickDirectory());
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
});

// ---- search ----

function runSearch(q) {
  el.recent.classList.add("hidden");
  const lq = q.toLowerCase();

  if (!index) {
    el.tree.innerHTML = `<div class="nt-section-label" style="padding:16px 12px">Indexing…</div>`;
    return;
  }

  const results = [];
  for (const [path, content] of index) {
    const name = path.split("/").pop().replace(/\.md$/, "");
    const nameIdx = name.toLowerCase().indexOf(lq);
    const contentIdx = content.toLowerCase().indexOf(lq);
    if (nameIdx !== -1 || contentIdx !== -1) {
      results.push({ path, name, nameMatch: nameIdx !== -1, contentIdx, content });
    }
  }
  results.sort((a, b) => {
    if (a.nameMatch !== b.nameMatch) return a.nameMatch ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  renderSearchResults(results, q, el.tree, onNoteSelect);
}

function exitSearch() {
  el.recent.classList.remove("hidden");
  renderTree(lastTree, el.tree);
  if (currentPath) setSelected(currentPath);
}

el.searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const q = el.searchInput.value.trim();
  if (!q) { exitSearch(); return; }
  searchDebounce = setTimeout(() => runSearch(q), 200);
});

el.searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    el.searchInput.value = "";
    exitSearch();
    el.searchInput.blur();
  }
});

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
