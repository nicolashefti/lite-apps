// Daily rolling backups (spec §7): once per calendar day, keep the last 14.

import { idbGet, idbSet, KEY_BACKUP_DIR } from "./fileHandle.js";

const KEEP = 14;
const LAST_BACKUP_KEY = "ptm.lastBackupDate";
const BACKUP_RE = /^tasks\.backup-\d{4}-\d{2}-\d{2}\.json$/;

export async function chooseBackupDir() {
  const dir = await window.showDirectoryPicker({ mode: "readwrite" });
  await idbSet(KEY_BACKUP_DIR, dir);
  return dir;
}

export function storedBackupDir() {
  return idbGet(KEY_BACKUP_DIR);
}

// Returns "done" | "no-dir" | "no-permission" so the UI can nudge the user.
export async function maybeDailyBackup(data) {
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(LAST_BACKUP_KEY) === today) return "done";

  const dir = await storedBackupDir();
  if (!dir) return "no-dir";
  if ((await dir.queryPermission({ mode: "readwrite" })) !== "granted") return "no-permission";

  await writeFile(dir, `tasks.backup-${today}.json`, JSON.stringify(data, null, 2));
  await prune(dir);
  localStorage.setItem(LAST_BACKUP_KEY, today);
  return "done";
}

// Written before applying migrations, with the raw pre-migration text (spec §2.5).
export async function preMigrationBackup(rawText, fromVersion) {
  const name = `tasks.pre-migration-v${fromVersion}-${Date.now()}.json`;
  const dir = await storedBackupDir().catch(() => null);
  if (dir && (await dir.queryPermission({ mode: "readwrite" })) === "granted") {
    await writeFile(dir, name, rawText);
    console.info(`[backup] wrote pre-migration backup ${name}`);
  } else {
    console.warn(`[backup] no backup directory available — skipped pre-migration backup ${name}`);
  }
}

async function writeFile(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

async function prune(dir) {
  const names = [];
  for await (const [name] of dir.entries()) {
    if (BACKUP_RE.test(name)) names.push(name);
  }
  names.sort();
  for (const name of names.slice(0, Math.max(0, names.length - KEEP))) {
    await dir.removeEntry(name);
  }
}
