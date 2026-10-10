// Ships README.npm.md as the package README (see scripts/npm-readme.mjs).
//   prepack:  node scripts/pack-readme.mjs swap     regenerate README.npm.md, back up README.md, swap it in
//   postpack: node scripts/pack-readme.mjs restore  put the repo README back
//
// npm skips postpack when packing fails, so "swap" also leaves a trap: a detached watcher
// that waits for the npm process to exit and restores README.md if postpack didn't.
// As further safety nets, "swap" first restores a backup left by an earlier run,
// "restore" is safe any time, and `npm test` (pretest) plus a unit test refuse a swapped README.md.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { currentNpmReadme, NPM_README } from "./npm-readme.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const README = join(root, "README.md");
export const BACKUP = join(root, ".README.repo.md");
// npm always packs README* files, so README.npm.md waits here while packing.
const NPM_ASIDE = join(root, ".README.npm.md");
const SELF = fileURLToPath(import.meta.url);

export function restore() {
  if (existsSync(NPM_ASIDE)) renameSync(NPM_ASIDE, NPM_README);
  if (!existsSync(BACKUP)) return false;
  renameSync(BACKUP, README); // atomic on the same volume
  return true;
}

/** Running processes as { pid, ppid, cmd }, or [] when they can't be listed. */
function processTable() {
  if (process.platform === "win32") {
    const script = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress";
    const res = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 10_000 });
    try {
      const rows = JSON.parse(res.stdout);
      return (Array.isArray(rows) ? rows : [rows]).map((r) => ({ pid: r.ProcessId, ppid: r.ParentProcessId, cmd: r.CommandLine ?? "" }));
    } catch {
      return [];
    }
  }
  const res = spawnSync("ps", ["-A", "-o", "pid=,ppid=,args="], { encoding: "utf8", timeout: 10_000 });
  return (res.stdout ?? "")
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), cmd: m[3] }));
}

/** The npm process running this lifecycle script: the nearest ancestor that is npm itself. */
export function findNpmAncestor(table, startPid) {
  const byPid = new Map(table.map((p) => [p.pid, p]));
  let current = byPid.get(startPid);
  for (let hops = 0; current && hops < 10; hops++) {
    const parent = byPid.get(current.ppid);
    if (!parent) return null;
    if (/npm-cli\.js|(^|[\s/"])npm(\.cmd)?("?)(\s|$)/i.test(parent.cmd.replaceAll("\\", "/"))) return parent.pid;
    current = parent;
  }
  return null;
}

function leaveTrap() {
  const npmPid = findNpmAncestor(processTable(), process.pid);
  if (!npmPid) return; // fall back to the other safety nets
  spawn(process.execPath, [SELF, "watch", String(npmPid)], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function watch(pid) {
  const deadline = Date.now() + 30 * 60_000;
  while (alive(pid) && Date.now() < deadline && existsSync(BACKUP)) await new Promise((r) => setTimeout(r, 300));
  if (!alive(pid)) restore();
}

export function swap() {
  if (restore()) console.warn("pack-readme: restored README.md left swapped by an earlier failed pack");
  writeFileSync(NPM_README, currentNpmReadme());
  copyFileSync(README, BACKUP);
  try {
    copyFileSync(NPM_README, README);
    renameSync(NPM_README, NPM_ASIDE);
  } catch (error) {
    restore();
    throw error;
  }
  leaveTrap();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv[2];
  if (command === "swap") swap();
  else if (command === "restore") {
    if (restore()) console.log("pack-readme: README.md restored");
  } else if (command === "watch") await watch(Number(process.argv[3]));
  else {
    console.error("usage: node scripts/pack-readme.mjs swap|restore");
    process.exit(2);
  }
}