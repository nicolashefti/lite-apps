// Data format constants, defaults, validation, repair pass and migrations.
// Source of truth for the file format: docs/task-manager-spec.md §2.

export const FORMAT = "personal-task-manager";
export const SCHEMA_VERSION = 2;
export const APP_VERSION = "1.1.0";
export const INBOX_ID = "inbox";

export const PRIORITY_LABELS = { 0: "", 1: "Low", 2: "Med", 3: "High" };

export const PROJECT_STATUSES = ["poc", "mvp", "run"];
export const PROJECT_STATUS_LABELS = { poc: "POC", mvp: "MVP", run: "Run" };

const LIST_COLORS = ["#5B8DEF", "#E8927C", "#7CC47F", "#C58AF9", "#F2C14E", "#6BC5D2"];

export function nowIso() {
  return new Date().toISOString();
}

export function createEmptyData(deviceId) {
  const ts = nowIso();
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    meta: {
      createdAt: ts,
      updatedAt: ts,
      appVersion: APP_VERSION,
      deviceId,
      revision: 0,
    },
    settings: { defaultListId: INBOX_ID },
    lists: [inboxList()],
    projects: [],
    tasks: [],
  };
}

function inboxList() {
  return { id: INBOX_ID, name: "Inbox", color: "#5B8DEF", order: 0, archived: false };
}

export function createList(name, order) {
  return {
    id: crypto.randomUUID(),
    name,
    color: LIST_COLORS[Math.floor(Math.random() * LIST_COLORS.length)],
    order,
    archived: false,
  };
}

export function createProject(name, order) {
  return {
    id: crypto.randomUUID(),
    name,
    status: "poc",
    archived: false,
    order,
  };
}

export function createTask(listId, title, order, projectId = null) {
  const ts = nowIso();
  return {
    id: crypto.randomUUID(),
    listId,
    projectId,
    title,
    notes: "",
    status: "open",
    priority: 0,
    tags: [],
    dueDate: null,
    createdAt: ts,
    updatedAt: ts,
    completedAt: null,
    order,
    subtasks: [],
  };
}

export function shortId() {
  return crypto.randomUUID().slice(0, 8);
}

// Migrations map: { fromVersion: (data) => data }, applied sequentially
// from the file's schemaVersion up to SCHEMA_VERSION (spec §2.5).
export const migrations = {
  // v1 → v2: introduce projects. Existing tasks become orphans (projectId
  // null), surfaced in the UI under the virtual "Orphans" project.
  1: (data) => {
    if (!Array.isArray(data.projects)) data.projects = [];
    for (const t of data.tasks ?? []) t.projectId ??= null;
    return data;
  },
};

export function needsMigration(data) {
  return data.schemaVersion < SCHEMA_VERSION;
}

export function applyMigrations(data) {
  let v = data.schemaVersion;
  while (v < SCHEMA_VERSION) {
    const step = migrations[v];
    if (!step) throw new Error(`No migration path from schema v${v}.`);
    data = step(data);
    v += 1;
    data.schemaVersion = v;
  }
  return data;
}

// Throws with a user-facing message when the file must be rejected (spec §2.4).
export function validate(data) {
  if (!data || typeof data !== "object") {
    throw new Error("This file does not contain task data.");
  }
  if (data.format !== FORMAT) {
    throw new Error("This file was not created by this app (unexpected \"format\" field).");
  }
  if (typeof data.schemaVersion !== "number") {
    throw new Error("The file is missing its schema version.");
  }
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new Error("This file was created by a newer version of the app. Update the app to open it.");
  }
  for (const key of ["meta", "lists", "tasks"]) {
    if (!(key in data)) throw new Error(`The file is missing its "${key}" section.`);
  }
}

// Non-destructive repair pass, every fix logged to the console (spec §2.4).
// Mutates in place so unknown extra keys are preserved and written back untouched.
export function repair(data) {
  const log = (msg) => console.warn(`[repair] ${msg}`);

  if (!data.settings || typeof data.settings !== "object") {
    data.settings = { defaultListId: INBOX_ID };
    log("settings section missing → recreated with defaults");
  }
  if (!Array.isArray(data.lists)) data.lists = [];
  if (!Array.isArray(data.tasks)) data.tasks = [];

  if (!data.lists.some((l) => l.id === INBOX_ID)) {
    data.lists.unshift(inboxList());
    log('built-in "inbox" list missing → recreated');
  }
  for (const l of data.lists) {
    l.name ??= "Untitled";
    l.color ??= "#5B8DEF";
    l.order ??= 0;
    l.archived ??= false;
  }

  if (!Array.isArray(data.projects)) data.projects = [];
  for (const p of data.projects) {
    p.name ??= "Untitled";
    if (!PROJECT_STATUSES.includes(p.status)) {
      log(`project ${p.id} had invalid status "${p.status}" → "poc"`);
      p.status = "poc";
    }
    p.archived ??= false;
    p.order ??= 0;
  }

  const listIds = new Set(data.lists.map((l) => l.id));
  const projectIds = new Set(data.projects.map((p) => p.id));
  const seenTaskIds = new Set();
  for (const t of data.tasks) {
    if (!listIds.has(t.listId)) {
      log(`task ${t.id} referenced unknown list "${t.listId}" → moved to inbox`);
      t.listId = INBOX_ID;
    }
    if (t.projectId != null && !projectIds.has(t.projectId)) {
      log(`task ${t.id} referenced unknown project "${t.projectId}" → orphaned`);
      t.projectId = null;
    }
    if (seenTaskIds.has(t.id)) {
      const old = t.id;
      t.id = crypto.randomUUID();
      log(`duplicate task id ${old} → regenerated as ${t.id}`);
    }
    seenTaskIds.add(t.id);
    fillTaskDefaults(t);
  }
  return data;
}

function fillTaskDefaults(t) {
  t.title ??= "(untitled)";
  t.projectId ??= null;
  t.notes ??= "";
  t.status ??= "open";
  t.priority ??= 0;
  t.tags ??= [];
  t.dueDate ??= null;
  t.createdAt ??= nowIso();
  t.updatedAt ??= t.createdAt;
  t.completedAt ??= null;
  t.order ??= 0;
  t.subtasks ??= [];
  t.tags = [...new Set(t.tags.map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
}
