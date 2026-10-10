import os from "node:os";
import path from "node:path";

const caseInsensitive = process.platform === "win32";

/** Forward slashes, no trailing slash, lowercase on Windows: for comparisons only. */
export function normalizePath(p: string): string {
  const s = p.replace(/\x5c/g, "/").replace(/\/+$/, "");
  return caseInsensitive ? s.toLowerCase() : s;
}

export function samePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

export function isInside(file: string, dir: string): boolean {
  const f = normalizePath(file);
  const d = normalizePath(dir);
  return f === d || f.startsWith(`${d}/`);
}

/** Display form: home directory replaced by "~". */
export function displayPath(p: string): string {
  const home = os.homedir();
  return home && isInside(p, home) ? `~${p.slice(home.length)}` : p;
}

/** Directory of a binary, for display. */
export function displayDir(binPath: string): string {
  return displayPath(path.dirname(binPath));
}

/** Windows: is this path under Program Files (writing there needs an elevated terminal)? */
export function isUnderProgramFiles(p: string): boolean {
  if (process.platform !== "win32") return false;
  return [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.ProgramW6432].some(
    (root) => root && isInside(p, root),
  );
}
