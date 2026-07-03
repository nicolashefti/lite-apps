// Kanban board rendering: one column per non-archived list. The whole board
// re-renders on every store change — cheap at personal scale.

import {
  visibleLists,
  tasksInList,
  addTask,
  setStatus,
  moveTask,
  renameList,
  deleteList,
  getProject,
} from "../model/store.js";
import { INBOX_ID, PRIORITY_LABELS } from "../model/schema.js";
import { openTaskEditor } from "./taskModal.js";

export function renderBoard(root) {
  root.textContent = "";
  for (const list of visibleLists()) {
    root.appendChild(columnEl(list));
  }
}

function columnEl(list) {
  const tasks = tasksInList(list.id);
  const col = document.createElement("section");
  col.className = "column";
  col.dataset.listId = list.id;

  const header = document.createElement("header");
  const dot = document.createElement("span");
  dot.className = "list-dot";
  dot.style.background = list.color;
  const name = document.createElement("h2");
  name.textContent = list.name;
  name.title = "Double-click to rename";
  name.addEventListener("dblclick", () => {
    const next = prompt("Rename list", list.name);
    if (next !== null) renameList(list.id, next);
  });
  const count = document.createElement("span");
  count.className = "count";
  count.textContent = tasks.filter((t) => t.status === "open").length;
  header.append(dot, name, count);
  if (list.id !== INBOX_ID) {
    const del = document.createElement("button");
    del.className = "icon-btn";
    del.title = "Delete list (tasks move to Inbox)";
    del.textContent = "×";
    del.addEventListener("click", () => {
      if (confirm(`Delete list "${list.name}"? Its tasks move to Inbox.`)) {
        deleteList(list.id);
      }
    });
    header.appendChild(del);
  }

  const cards = document.createElement("div");
  cards.className = "cards";
  for (const task of tasks) cards.appendChild(cardEl(task));

  const input = document.createElement("input");
  input.className = "add-input";
  input.placeholder = "Add a task…";
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const title = input.value;
    addTask(list.id, title); // triggers a full re-render
    const fresh = document.querySelector(
      `.column[data-list-id="${CSS.escape(list.id)}"] .add-input`
    );
    fresh?.focus();
  });

  col.append(header, cards, input);

  // Drop on the column body appends to the end of the list.
  col.addEventListener("dragover", (e) => {
    e.preventDefault();
    col.classList.add("drag-over");
  });
  col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
  col.addEventListener("drop", (e) => {
    e.preventDefault();
    col.classList.remove("drag-over");
    const id = e.dataTransfer.getData("text/plain");
    if (id) moveTask(id, list.id);
  });

  return col;
}

function cardEl(task) {
  const card = document.createElement("article");
  card.className = `card status-${task.status}`;
  card.draggable = true;
  card.dataset.taskId = task.id;

  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
  });
  // Drop on a card inserts before it.
  card.addEventListener("drop", (e) => {
    const id = e.dataTransfer.getData("text/plain");
    if (!id || id === task.id) return;
    e.preventDefault();
    e.stopPropagation();
    const index = tasksInList(task.listId).findIndex((t) => t.id === task.id);
    moveTask(id, task.listId, index);
  });

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = task.status === "done";
  cb.title = "Mark done";
  cb.addEventListener("click", (e) => e.stopPropagation());
  cb.addEventListener("change", () => setStatus(task.id, cb.checked ? "done" : "open"));

  const body = document.createElement("div");
  body.className = "card-body";
  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = task.title;
  body.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const project = task.projectId ? getProject(task.projectId) : null;
  if (project) {
    const chip = document.createElement("span");
    chip.className = "project-chip";
    chip.textContent = project.name;
    meta.appendChild(chip);
  }
  if (task.priority > 0) {
    const p = document.createElement("span");
    p.className = `prio prio-${task.priority}`;
    p.textContent = PRIORITY_LABELS[task.priority];
    meta.appendChild(p);
  }
  if (task.dueDate) {
    const due = document.createElement("span");
    due.className = "due";
    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
    if (task.status === "open" && task.dueDate < today) due.classList.add("overdue");
    due.textContent = task.dueDate;
    meta.appendChild(due);
  }
  if (task.subtasks.length) {
    const st = document.createElement("span");
    st.className = "subtask-count";
    st.textContent = `${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length}`;
    meta.appendChild(st);
  }
  for (const tag of task.tags) {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = tag;
    meta.appendChild(chip);
  }
  if (meta.childNodes.length) body.appendChild(meta);

  card.append(cb, body);
  card.addEventListener("click", () => openTaskEditor(task.id));
  return card;
}
