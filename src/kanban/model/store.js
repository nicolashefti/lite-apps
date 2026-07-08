// In-memory store. All state changes go through mutate() (spec §3):
// it applies the change, stamps meta.updatedAt, notifies the UI and
// triggers the save hook (wired to the debounced save in main.js).

import { nowIso, createTask, createList, createProject, INBOX_ID } from "./schema.js";

export const store = { data: null };

const listeners = new Set();
let onMutateHook = null;

export function setData(data) {
  store.data = data;
  emit();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setMutateHook(fn) {
  onMutateHook = fn;
}

function emit() {
  for (const fn of listeners) fn(store.data);
}

export function mutate(fn) {
  fn(store.data);
  store.data.meta.updatedAt = nowIso();
  emit();
  onMutateHook?.();
}

// ---- selectors -------------------------------------------------------------

export function getTask(id) {
  return store.data.tasks.find((t) => t.id === id);
}

export function tasksInList(listId) {
  return store.data.tasks
    .filter((t) => t.listId === listId)
    .sort((a, b) => a.order - b.order);
}

export function visibleLists() {
  return store.data.lists
    .filter((l) => !l.archived)
    .sort((a, b) => a.order - b.order);
}

export function getProject(id) {
  return store.data.projects.find((p) => p.id === id);
}

export function visibleProjects() {
  return store.data.projects
    .filter((p) => !p.archived)
    .sort((a, b) => a.order - b.order);
}

export function archivedProjects() {
  return store.data.projects
    .filter((p) => p.archived)
    .sort((a, b) => a.order - b.order);
}

// projectId null selects orphan tasks (the virtual "Orphans" project).
export function tasksInProject(projectId) {
  return store.data.tasks.filter((t) => (t.projectId ?? null) === projectId);
}

// Completion excludes cancelled tasks — they are neither done nor pending.
export function projectStats(projectId) {
  const tasks = tasksInProject(projectId).filter((t) => t.status !== "cancelled");
  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

// ---- task operations -------------------------------------------------------

export function addTask(listId, title, projectId = null) {
  const clean = title.trim().slice(0, 500);
  if (!clean) return;
  mutate((d) => {
    const order =
      Math.max(-1, ...d.tasks.filter((t) => t.listId === listId).map((t) => t.order)) + 1;
    d.tasks.push(createTask(listId, clean, order, projectId));
  });
}

// Quick capture from the project view: new tasks land in the lowest-order
// (leftmost) non-archived list.
export function addTaskToProject(projectId, title) {
  const list = visibleLists()[0];
  if (!list) return;
  addTask(list.id, title, projectId);
}

export function updateTask(id, patch) {
  mutate(() => {
    const t = getTask(id);
    if (!t) return;
    const prevStatus = t.status;
    Object.assign(t, patch);
    if (typeof t.title === "string") t.title = t.title.trim().slice(0, 500) || "(untitled)";
    if ("tags" in patch) {
      t.tags = [...new Set(patch.tags.map((s) => s.trim().toLowerCase()).filter(Boolean))];
    }
    if (t.status !== prevStatus) {
      t.completedAt = t.status === "done" ? nowIso() : null;
    }
    t.updatedAt = nowIso();
  });
}

export function setStatus(id, status) {
  updateTask(id, { status });
}

// Hard delete per spec §2.3 — tasks are removed from the array, no tombstones.
export function deleteTask(id) {
  mutate((d) => {
    d.tasks = d.tasks.filter((t) => t.id !== id);
  });
}

export function moveTask(id, listId, index = Infinity) {
  mutate((d) => {
    const t = d.tasks.find((x) => x.id === id);
    if (!t) return;
    const siblings = d.tasks
      .filter((x) => x.listId === listId && x.id !== id)
      .sort((a, b) => a.order - b.order);
    t.listId = listId;
    const i = Math.max(0, Math.min(index, siblings.length));
    siblings.splice(i, 0, t);
    siblings.forEach((x, n) => (x.order = n));
    t.updatedAt = nowIso();
  });
}

// ---- project operations ----------------------------------------------------

export function addProject(name) {
  const clean = name.trim();
  if (!clean) return;
  mutate((d) => {
    const order = Math.max(-1, ...d.projects.map((p) => p.order)) + 1;
    d.projects.push(createProject(clean, order));
  });
}

export function updateProject(id, patch) {
  mutate((d) => {
    const p = d.projects.find((x) => x.id === id);
    if (!p) return;
    Object.assign(p, patch);
    if ("name" in patch) p.name = String(patch.name).trim() || "Untitled";
  });
}

// ---- list operations -------------------------------------------------------

export function addList(name) {
  const clean = name.trim();
  if (!clean) return;
  mutate((d) => {
    const order = Math.max(-1, ...d.lists.map((l) => l.order)) + 1;
    d.lists.push(createList(clean, order));
  });
}

export function renameList(id, name) {
  const clean = name.trim();
  if (!clean) return;
  mutate((d) => {
    const l = d.lists.find((x) => x.id === id);
    if (l) l.name = clean;
  });
}

// The inbox cannot be deleted (spec §2.2); tasks of a deleted list move to it.
export function deleteList(id) {
  if (id === INBOX_ID) return;
  mutate((d) => {
    for (const t of d.tasks) {
      if (t.listId === id) {
        t.listId = INBOX_ID;
        t.updatedAt = nowIso();
      }
    }
    d.lists = d.lists.filter((l) => l.id !== id);
  });
}
