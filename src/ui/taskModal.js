// Task editor dialog. Edits are collected locally and applied in a single
// updateTask() on save, so the store mutates (and autosaves) once.

import { getTask, updateTask, deleteTask } from "../model/store.js";
import { shortId } from "../model/schema.js";
import { showModal, escapeHtml } from "./modal.js";

export function openTaskEditor(taskId) {
  const task = getTask(taskId);
  if (!task) return;
  const subtasks = task.subtasks.map((s) => ({ ...s }));

  const box = document.createElement("div");
  box.className = "modal task-editor";
  box.innerHTML = `
    <form>
      <input name="title" class="title-input" value="${escapeHtml(task.title)}" maxlength="500" required>
      <textarea name="notes" rows="4" placeholder="Notes…">${escapeHtml(task.notes)}</textarea>
      <div class="field-row">
        <label>Status
          <select name="status">
            <option value="open">Open</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>Priority
          <select name="priority">
            <option value="0">None</option>
            <option value="1">Low</option>
            <option value="2">Medium</option>
            <option value="3">High</option>
          </select>
        </label>
        <label>Due date
          <input type="date" name="dueDate" value="${task.dueDate ?? ""}">
        </label>
      </div>
      <label>Tags <input name="tags" placeholder="comma, separated"
        value="${escapeHtml(task.tags.join(", "))}"></label>
      <div class="subtasks">
        <h3>Subtasks</h3>
        <ul class="subtask-list"></ul>
        <input class="subtask-add" placeholder="Add subtask and press Enter">
      </div>
      <div class="modal-actions">
        <button type="button" class="danger" data-action="delete">Delete</button>
        <span class="spacer"></span>
        <button type="button" data-action="cancel">Cancel</button>
        <button type="submit" class="primary">Save</button>
      </div>
    </form>`;

  box.querySelector('[name="status"]').value = task.status;
  box.querySelector('[name="priority"]').value = String(task.priority);

  const listEl = box.querySelector(".subtask-list");
  const renderSubtasks = () => {
    listEl.textContent = "";
    for (const s of subtasks) {
      const li = document.createElement("li");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = s.done;
      cb.addEventListener("change", () => (s.done = cb.checked));
      const span = document.createElement("span");
      span.textContent = s.title;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "icon-btn";
      rm.textContent = "×";
      rm.addEventListener("click", () => {
        subtasks.splice(subtasks.indexOf(s), 1);
        renderSubtasks();
      });
      li.append(cb, span, rm);
      listEl.appendChild(li);
    }
  };
  renderSubtasks();

  box.querySelector(".subtask-add").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const title = e.target.value.trim();
    if (!title) return;
    subtasks.push({ id: shortId(), title, done: false });
    e.target.value = "";
    renderSubtasks();
  });

  const close = showModal(box);
  box.querySelector('[data-action="cancel"]').addEventListener("click", close);
  box.querySelector('[data-action="delete"]').addEventListener("click", () => {
    if (confirm("Delete this task? This cannot be undone.")) {
      deleteTask(taskId);
      close();
    }
  });

  box.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    updateTask(taskId, {
      title: f.get("title"),
      notes: f.get("notes"),
      status: f.get("status"),
      priority: Number(f.get("priority")),
      dueDate: f.get("dueDate") || null,
      tags: f.get("tags").split(","),
      subtasks,
    });
    close();
  });
}
