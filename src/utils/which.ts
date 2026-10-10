import { envVar, getHost, pathFor, type Host } from "./host";
import { normalizePath } from "./paths";

/**
 * Extensions to try on Windows, in priority order: PATHEXT, then .ps1
 * (npm also drops PowerShell shims, and PowerShell can run them).
 * Extensionless POSIX shims next to .cmd files are deliberately skipped.
 */
function windowsExtensions(host: Host): string[] {
  const exts = (envVar(host, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean);
  return exts.includes(".ps1") ? exts : [...exts, ".ps1"];
}

/** First matching executable inside one directory, or null. */
function findInDir(dir: string, names: readonly string[], exts: readonly string[], host: Host): string | null {
  const p = pathFor(host.platform);
  const isWindows = host.platform === "win32";
  for (const name of names) {
    const hasExt = isWindows && exts.includes(p.extname(name).toLowerCase());
    const candidates = hasExt ? [name] : exts.map((ext) => name + ext);
    for (const candidate of candidates) {
      const full = p.join(dir, candidate);
      if (host.fs.isExecutable(full)) return full;
    }
  }
  return null;
}

/**
 * Every executable on PATH matching `names`, in PATH order: the first entry is
 * what a shell actually runs, the rest are shadowed. Pure function of the host
 * (no where/which, no globals). Variants in one directory (foo.cmd, foo.ps1)
 * count as a single install; duplicate PATH entries and symlinked duplicates
 * are collapsed.
 */
export function findAllExecutables(names: readonly string[], host: Host = getHost()): string[] {
  const p = pathFor(host.platform);
  const exts = host.platform === "win32" ? windowsExtensions(host) : [""];
  const dirs = (envVar(host, "PATH") ?? "")
    .split(p.delimiter)
    .map((dir) => dir.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);

  const seenDirs = new Set<string>();
  const seenTargets = new Set<string>();
  const found: string[] = [];

  for (const dir of dirs) {
    const dirKey = normalizePath(p.normalize(dir), host.platform);
    if (seenDirs.has(dirKey)) continue;
    seenDirs.add(dirKey);

    const hit = findInDir(dir, names, exts, host);
    if (!hit) continue;
    const target = normalizePath(host.fs.realpath(hit), host.platform);
    if (seenTargets.has(target)) continue;
    seenTargets.add(target);
    found.push(hit);
  }
  return found;
}
