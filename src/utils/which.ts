import { accessSync, constants, realpathSync, statSync } from "node:fs";
import path from "node:path";

const isWindows = process.platform === "win32";

function windowsExtensions(): string[] {
  const raw = process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD";
  return raw
    .split(";")
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean);
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

/**
 * Locate the first executable on PATH matching any of `names`, in PATH order
 * (so the result is what a shell would actually run). Pure filesystem lookup,
 * no `where`/`which` subprocess. On Windows only PATHEXT extensions match,
 * which skips the extensionless POSIX shims npm drops next to .cmd files.
 */
export function findExecutable(names: string[]): string | null {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const exts = isWindows ? windowsExtensions() : [""];

  for (const dir of dirs) {
    for (const name of names) {
      const hasExt = isWindows && exts.includes(path.extname(name).toLowerCase());
      const candidates = hasExt ? [name] : exts.map((ext) => name + ext);
      for (const candidate of candidates) {
        const full = path.join(dir.replace(/^"(.*)"$/, "$1"), candidate);
        if (isExecutableFile(full)) return full;
      }
    }
  }
  return null;
}

/** Resolve symlinks (e.g. /usr/local/bin/x -> ../lib/node_modules/...). Falls back to the input. */
export function safeRealpath(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}
