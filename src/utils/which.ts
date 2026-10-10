import { accessSync, constants, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { normalizePath } from "./paths";

const isWindows = process.platform === "win32";

/**
 * Extensions to try on Windows, in priority order: PATHEXT, then .ps1
 * (npm also drops PowerShell shims, and PowerShell can run them).
 * Extensionless POSIX shims next to .cmd files are deliberately skipped.
 */
function windowsExtensions(): string[] {
  const exts = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean);
  return exts.includes(".ps1") ? exts : [...exts, ".ps1"];
}

function isExecutableFile(file: string): boolean {
  try {
    if (!statSync(file).isFile()) return false;
    if (!isWindows) accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolve symlinks (e.g. /usr/local/bin/x -> ../lib/node_modules/...). Falls back to the input. */
export function safeRealpath(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}

/** First matching executable inside one directory, or null. */
function findInDir(dir: string, names: readonly string[], exts: readonly string[]): string | null {
  for (const name of names) {
    const hasExt = isWindows && exts.includes(path.extname(name).toLowerCase());
    const candidates = hasExt ? [name] : exts.map((ext) => name + ext);
    for (const candidate of candidates) {
      const full = path.join(dir, candidate);
      if (isExecutableFile(full)) return full;
    }
  }
  return null;
}

/**
 * Every executable on PATH matching `names`, in PATH order: the first entry is
 * what a shell actually runs, the rest are shadowed. Pure filesystem walk (no
 * where/which). Variants in one directory (foo.cmd, foo.ps1) count as a single
 * install; duplicate PATH entries and symlinked duplicates are collapsed.
 */
export function findAllExecutables(names: readonly string[]): string[] {
  const exts = isWindows ? windowsExtensions() : [""];
  const dirs = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((dir) => dir.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);

  const seenDirs = new Set<string>();
  const seenTargets = new Set<string>();
  const found: string[] = [];

  for (const dir of dirs) {
    const dirKey = normalizePath(path.resolve(dir));
    if (seenDirs.has(dirKey)) continue;
    seenDirs.add(dirKey);

    const hit = findInDir(dir, names, exts);
    if (!hit) continue;
    const target = normalizePath(safeRealpath(hit));
    if (seenTargets.has(target)) continue;
    seenTargets.add(target);
    found.push(hit);
  }
  return found;
}
