// Boot + wiring: screens, file handle lifecycle (spec §4), browser events,
// save status indicator and the Safari/Firefox fallback mode (spec §5.4).

import {
  fsSupported,
  storedFileHandle,
  pickNewFile,
  pickExistingFile,
  hasPermission,
  requestPermission,
} from "./storage/fileHandle.js";
import * as persistence from "./storage/persistence.js";
import { maybeDailyBackup, chooseBackupDir } from "./storage/backups.js";
import {
  store,
  setData,
  setMutateHook,
  subscribe,
  addList,
  addProject,
} from "./model/store.js";
import { createEmptyData } from "./model/schema.js";
import { renderBoard } from "./ui/board.js";
import { renderProjects } from "./ui/projects.js";
import { conflictModal } from "./ui/modal.js";

const DEVICE_KEY = "ptm.deviceId";

const $ = (id) => document.getElementById(id);
const els = {
  topbar: $("topbar"),
  welcome: $("welcome"),
  welcomeMsg: $("welcome-msg"),
  board: $("board"),
  projects: $("projects"),
  status: $("save-status"),
  createBtn: $("create-file-btn"),
  openBtn: $("open-file-btn"),
  reconnectBtn: $("reconnect-btn"),
  fileInput: $("file-input"),
  newListBtn: $("new-list-btn"),
  newProjectBtn: $("new-project-btn"),
  viewBoardBtn: $("view-board-btn"),
  viewProjectsBtn: $("view-projects-btn"),
  backupBtn: $("backup-btn"),
  downloadBtn: $("download-btn"),
};

let currentView = localStorage.getItem("ptm.view") === "projects" ? "projects" : "board";

function applyView() {
  els.board.classList.toggle("hidden", currentView !== "board");
  els.projects.classList.toggle("hidden", currentView !== "projects");
  els.viewBoardBtn.classList.toggle("active", currentView === "board");
  els.viewProjectsBtn.classList.toggle("active", currentView === "projects");
  els.newListBtn.classList.toggle("hidden", currentView !== "board");
  els.newProjectBtn.classList.toggle("hidden", currentView !== "projects");
}

function setView(view) {
  currentView = view;
  localStorage.setItem("ptm.view", view);
  applyView();
}

let fallbackMode = !fsSupported();

// Random ID generated once per browser profile (spec §2.1).
function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function setStatus(state) {
  const map = {
    saved: ["Saved ✓", "ok"],
    saving: ["Saving…", "busy"],
    error: ["⚠ Save failed (retrying)", "err"],
    unsaved: ["Unsaved changes", "busy"],
  };
  const [text, cls] = map[state] ?? ["", ""];
  els.status.textContent = text;
  els.status.className = `save-status ${cls}`;
}

function showWelcome(message = "") {
  els.welcomeMsg.textContent = message;
  els.welcome.classList.remove("hidden");
  els.board.classList.add("hidden");
  els.projects.classList.add("hidden");
  els.topbar.classList.add("hidden");
  els.reconnectBtn.classList.add("hidden");
}

function showBoard() {
  els.welcome.classList.add("hidden");
  els.topbar.classList.remove("hidden");
  applyView();
  els.downloadBtn.classList.toggle("hidden", !fallbackMode);
  els.backupBtn.classList.toggle("hidden", fallbackMode);
}

async function startWithData(data) {
  setData(data);
  showBoard();
  if (!fallbackMode) {
    setStatus("saved");
    const backupState = await maybeDailyBackup(store.data).catch(() => "no-dir");
    if (backupState !== "done") {
      els.backupBtn.classList.add("attention");
      els.backupBtn.title = "No backup folder configured — click to choose one";
    }
  }
}

async function openHandle(handle) {
  try {
    const data = await persistence.loadFromHandle(handle);
    persistence.init({ fileHandle: handle, id: deviceId() });
    await startWithData(data);
  } catch (err) {
    if (err.name === "NotFoundError") {
      showWelcome("Your task file was moved or deleted. Create a new one or open it from its new location.");
    } else {
      showWelcome(err.message);
    }
  }
}

async function boot() {
  if (fallbackMode) {
    showWelcome(
      "This browser does not support the File System Access API. You can still open and edit a file, but autosave is unavailable — use the Download button to save."
    );
    return;
  }
  const handle = await storedFileHandle().catch(() => null);
  if (!handle) {
    showWelcome();
  } else if (await hasPermission(handle)) {
    await openHandle(handle);
  } else {
    // Permission must be re-requested inside a user gesture (spec §4.3).
    showWelcome("Reconnect to your task file to continue.");
    els.reconnectBtn.classList.remove("hidden");
    els.reconnectBtn.onclick = async () => {
      if (await requestPermission(handle)) await openHandle(handle);
    };
  }
}

function downloadData() {
  const blob = new Blob([JSON.stringify(store.data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tasks.json";
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("saved");
}

// ---- wiring ----------------------------------------------------------------

subscribe(() => {
  renderBoard(els.board);
  renderProjects(els.projects);
});

setMutateHook(() => {
  if (fallbackMode) setStatus("unsaved");
  else persistence.scheduleSave();
});

persistence.hooks.onStatus = setStatus;
persistence.hooks.onConflict = conflictModal;
persistence.hooks.onExternalReload = () => setStatus("saved");

els.createBtn.addEventListener("click", async () => {
  if (fallbackMode) {
    await startWithData(createEmptyData(deviceId()));
    setStatus("unsaved");
    return;
  }
  try {
    const handle = await pickNewFile();
    persistence.init({ fileHandle: handle, id: deviceId() });
    setData(createEmptyData(deviceId()));
    showBoard();
    persistence.scheduleSave();
  } catch (err) {
    if (err.name !== "AbortError") showWelcome(err.message);
  }
});

els.openBtn.addEventListener("click", async () => {
  if (fallbackMode) {
    els.fileInput.click();
    return;
  }
  try {
    await openHandle(await pickExistingFile());
  } catch (err) {
    if (err.name !== "AbortError") showWelcome(err.message);
  }
});

els.fileInput.addEventListener("change", async () => {
  const file = els.fileInput.files[0];
  if (!file) return;
  try {
    await startWithData(await persistence.prepareData(await file.text()));
    setStatus("saved");
  } catch (err) {
    showWelcome(err.message);
  }
});

els.newListBtn.addEventListener("click", () => {
  const name = prompt("List name");
  if (name) addList(name);
});

els.newProjectBtn.addEventListener("click", () => {
  const name = prompt("Project name");
  if (name) addProject(name);
});

els.viewBoardBtn.addEventListener("click", () => setView("board"));
els.viewProjectsBtn.addEventListener("click", () => setView("projects"));

els.backupBtn.addEventListener("click", async () => {
  try {
    await chooseBackupDir();
    els.backupBtn.classList.remove("attention");
    els.backupBtn.title = "Backup folder configured";
    await maybeDailyBackup(store.data);
  } catch (err) {
    if (err.name !== "AbortError") console.error(err);
  }
});

els.downloadBtn.addEventListener("click", downloadData);

document.addEventListener("visibilitychange", () => {
  if (fallbackMode) return;
  if (document.visibilityState === "hidden") persistence.flushSave();
  else persistence.checkExternalChange();
});
window.addEventListener("beforeunload", () => {
  if (!fallbackMode) persistence.flushSave(); // best-effort
});

boot();
