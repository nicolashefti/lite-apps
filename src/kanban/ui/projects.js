// Project list view: status, completion and quick task capture per project,
// with an expandable panel showing the project's tasks grouped by list.
// Tasks with projectId null (or an unknown id, nulled by the repair pass)
// belong to the virtual "Orphans" project — it exists only in the UI, never
// in the file. It is shown only while orphan tasks exist.

import {
  store,
  visibleProjects,
  archivedProjects,
  projectStats,
  tasksInList,
  addTaskToProject,
  updateProject,
  setStatus,
  visibleLists,
} from "../model/store.js";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "../model/schema.js";
import { openTaskEditor } from "./taskModal.js";

const ORPHANS_KEY = "__orphans__"; // DOM/expansion key only, never persisted

// Session-only UI state; survives the full re-render on every store change.
const expanded = new Set();
let viewRoot = null;

export function renderProjects(root) {
  viewRoot = root;
  root.textContent = "";

  const orphanStats = projectStats(null);
  if (orphanStats.total > 0) root.appendChild(card(null, orphanStats));

  const active = visibleProjects();
  for (const p of active) root.appendChild(card(p, projectStats(p.id)));

  const archived = archivedProjects();
  if (archived.length) {
    const h = document.createElement("h3");
    h.className = "archived-heading";
    h.textContent = "Archived";
    root.appendChild(h);
    for (const p of archived) root.appendChild(card(p, projectStats(p.id)));
  }

  if (!active.length && !archived.length && orphanStats.total === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "No projects yet — create one with “+ New project”.";
    root.appendChild(empty);
  }
}

function card(project, stats) {
  const isOrphans = project === null;
  const key = isOrphans ? ORPHANS_KEY : project.id;
  const el = document.createElement("article");
  el.className = "project-card";
  el.dataset.projectId = key;
  if (isOrphans) el.classList.add("orphans");
  if (project?.archived) el.classList.add("archived");

  const row = document.createElement("div");
  row.className = "project-row";

  const caret = document.createElement("button");
  caret.className = "icon-btn caret";
  caret.textContent = "▸";
  caret.title = "Show tasks by list";
  if (expanded.has(key)) caret.classList.add("expanded");
  caret.addEventListener("click", () => {
    expanded.has(key) ? expanded.delete(key) : expanded.add(key);
    renderProjects(viewRoot);
  });

  const name = document.createElement("h2");
  name.textContent = isOrphans ? "Orphans" : project.name;
  if (!isOrphans) {
    name.title = "Double-click to rename";
    name.addEventListener("dblclick", () => {
      const next = prompt("Rename project", project.name);
      if (next !== null) updateProject(project.id, { name: next });
    });
  }

  let status;
  if (isOrphans) {
    status = document.createElement("span");
    status.className = "project-status none";
    status.textContent = "—";
  } else {
    status = document.createElement("select");
    status.className = "project-status";
    for (const s of PROJECT_STATUSES) {
      status.append(new Option(PROJECT_STATUS_LABELS[s], s));
    }
    status.value = project.status;
    status.addEventListener("change", () =>
      updateProject(project.id, { status: status.value })
    );
  }

  const completion = document.createElement("div");
  completion.className = "completion";
  const bar = document.createElement("div");
  bar.className = "progress";
  const fill = document.createElement("div");
  fill.className = "progress-fill";
  fill.style.width = `${stats.pct}%`;
  bar.appendChild(fill);
  const text = document.createElement("span");
  text.className = "completion-text";
  text.textContent = `${stats.done}/${stats.total} · ${stats.pct}%`;
  completion.append(bar, text);

  row.append(caret, name, status, completion);

  if (project?.archived) {
    row.appendChild(document.createElement("span")); // keep grid columns aligned
  } else {
    const input = document.createElement("input");
    input.className = "add-input project-add";
    const target = visibleLists()[0];
    input.placeholder = target ? `Add task to “${target.name}”…` : "Add a task…";
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      addTaskToProject(isOrphans ? null : project.id, input.value); // re-renders
      document
        .querySelector(`.project-card[data-project-id="${CSS.escape(key)}"] .project-add`)
        ?.focus();
    });
    row.appendChild(input);
  }

  if (isOrphans) {
    row.appendChild(document.createElement("span"));
  } else {
    const btn = document.createElement("button");
    btn.textContent = project.archived ? "Unarchive" : "Archive";
    btn.addEventListener("click", () =>
      updateProject(project.id, { archived: !project.archived })
    );
    row.appendChild(btn);
  }

  el.appendChild(row);
  if (expanded.has(key)) el.appendChild(taskPanel(isOrphans ? null : project.id));
  return el;
}

// Tasks grouped by list, lists in their manual order, tasks in theirs.
// Includes archived lists so no task of the project is ever hidden here.
function taskPanel(projectId) {
  const panel = document.createElement("div");
  panel.className = "project-tasks";
  const lists = [...store.data.lists].sort((a, b) => a.order - b.order);
  let any = false;

  for (const list of lists) {
    const tasks = tasksInList(list.id).filter((t) => (t.projectId ?? null) === projectId);
    if (!tasks.length) continue;
    any = true;

    const group = document.createElement("div");
    group.className = "ptask-group";
    const h = document.createElement("h4");
    const dot = document.createElement("span");
    dot.className = "list-dot";
    dot.style.background = list.color;
    const label = document.createElement("span");
    label.textContent = list.name;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = tasks.length;
    h.append(dot, label, count);
    group.appendChild(h);
    for (const t of tasks) group.appendChild(taskItem(t));
    panel.appendChild(group);
  }

  if (!any) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "No tasks yet.";
    panel.appendChild(empty);
  }
  return panel;
}

function taskItem(task) {
  const item = document.createElement("div");
  item.className = `ptask status-${task.status}`;

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = task.status === "done";
  cb.title = "Mark done";
  cb.addEventListener("click", (e) => e.stopPropagation());
  cb.addEventListener("change", () => setStatus(task.id, cb.checked ? "done" : "open"));

  const title = document.createElement("span");
  title.className = "ptask-title";
  title.textContent = task.title;

  item.append(cb, title);

  if (task.dueDate) {
    const due = document.createElement("span");
    due.className = "due";
    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
    if (task.status === "open" && task.dueDate < today) due.classList.add("overdue");
    due.textContent = task.dueDate;
    item.appendChild(due);
  }

  item.addEventListener("click", () => openTaskEditor(task.id));
  return item;
}
