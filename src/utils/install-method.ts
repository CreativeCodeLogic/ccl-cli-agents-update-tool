import path from "node:path";
import type { InstallMethod } from "../types";
import { getNpmGlobalPaths } from "./npm";
import { safeRealpath } from "./which";

const caseInsensitive = process.platform === "win32";

/** Forward slashes, no trailing slash (and lowercase on Windows) for substring checks. */
export function normalizePath(p: string): string {
  const s = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return caseInsensitive ? s.toLowerCase() : s;
}

function isInside(file: string, dir: string): boolean {
  const f = normalizePath(file);
  const d = normalizePath(dir);
  return f === d || f.startsWith(`${d}/`);
}

/**
 * Best-effort guess of how the executable at `binPath` was installed,
 * based on where it (and its symlink target) lives. Order matters:
 * Homebrew-packaged node apps also contain "node_modules" in their path,
 * and on Debian `npm root -g` can live under /usr/lib.
 */
export async function classifyInstallPath(binPath: string): Promise<InstallMethod> {
  const real = safeRealpath(binPath);
  const candidates = [normalizePath(binPath), normalizePath(real)];
  const any = (test: (p: string) => boolean) => candidates.some(test);

  if (any((p) => /\/(cellar|caskroom|homebrew|linuxbrew)\//i.test(p))) return "brew";
  if (any((p) => p.startsWith("/snap/"))) return "snap";

  const npm = await getNpmGlobalPaths();
  if (npm) {
    // POSIX global bins are symlinks into the root; Windows uses .cmd shims in the prefix.
    // (Matching /usr/bin by directory alone would mislabel apt packages.)
    const isWinShim =
      process.platform === "win32" && normalizePath(path.dirname(binPath)) === normalizePath(npm.prefix);
    if (isWinShim || isInside(real, npm.root)) return "npm";
  }
  // Globals managed by volta/nvm/fnm etc. live under some other node_modules.
  if (any((p) => p.includes("/node_modules/"))) return "npm";

  if (any((p) => p.includes("/site-packages/") || p.includes("/pipx/") || p.includes("/uv/tools/"))) {
    return "pip";
  }
  if (any((p) => p.startsWith("/usr/bin/") || p.startsWith("/usr/lib/") || p.startsWith("/usr/share/"))) {
    return "apt";
  }
  return "unknown";
}
