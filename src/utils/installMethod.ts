import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { InstallMethod } from "../types";
import { getNpmGlobalPaths } from "./npm";
import { isInside, normalizePath, samePath } from "./paths";

const isWindows = process.platform === "win32";

/** Executables that ship inside a Node.js install. */
const NODE_BUNDLED = new Set(["npm", "npx", "corepack"]);

function hasSiblingNode(binPath: string): boolean {
  const dir = path.dirname(binPath);
  return existsSync(path.join(dir, isWindows ? "node.exe" : "node"));
}

/** Install roots of vendor "native" installers. */
function isNativeLocation(p: string): boolean {
  const home = os.homedir();
  if (home && isInside(p, path.join(home, ".local", "bin"))) return true; // Claude Code, many installers
  if (home && isInside(p, home) && /^\/\.[^/]+\/bin\//.test(normalizePath(p).slice(normalizePath(home).length))) {
    return true; // ~/.<vendor>/bin, e.g. ~/.kimi-code/bin
  }
  if (isWindows) {
    const roots = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"), process.env.ProgramFiles, process.env["ProgramFiles(x86)"]];
    if (roots.some((root) => root && isInside(p, root))) return true;
  }
  return isInside(p, "/opt");
}

/**
 * Best-effort guess of how one executable was installed, from where it (and
 * its symlink target) lives. Order matters: Homebrew-packaged node apps also
 * contain "node_modules" in their path, and on Debian `npm root -g` can live
 * under /usr/lib. Tools can refine the result (see ToolDescriptor).
 */
export async function classifyInstall(binPath: string, realPath: string): Promise<InstallMethod> {
  const paths = [normalizePath(binPath), normalizePath(realPath)];
  const any = (test: (p: string) => boolean) => paths.some(test);

  if (any((p) => /\/(cellar|caskroom|homebrew|linuxbrew)\//i.test(p))) return "brew";
  if (any((p) => p.startsWith("/snap/"))) return "snap";

  const name = path.parse(binPath).name.toLowerCase();
  if (NODE_BUNDLED.has(name) && hasSiblingNode(binPath)) return "node";

  const npm = await getNpmGlobalPaths();
  if (npm) {
    // POSIX global bins are symlinks into the root; Windows uses shims in the prefix.
    // (Matching /usr/bin by directory alone would mislabel apt packages.)
    if (isInside(realPath, npm.root) || (isWindows && samePath(path.dirname(binPath), npm.prefix))) return "npm";
  }
  // Globals of other Node installs (nvm, volta, fnm, ...).
  if (any((p) => p.includes("/node_modules/"))) return "npm";
  if (isWindows && existsSync(path.join(path.dirname(binPath), "node_modules"))) return "npm";

  if (any((p) => p.includes("/site-packages/") || p.includes("/pipx/") || p.includes("/uv/tools/"))) return "pip";

  if (any((p) => p.startsWith("/usr/lib/google-cloud-sdk/"))) return "apt";
  if (any((p) => p.startsWith("/usr/bin/") || p.startsWith("/usr/lib/") || p.startsWith("/usr/share/"))) {
    return "apt";
  }

  if (isNativeLocation(binPath) || isNativeLocation(realPath)) return "native";
  return "unknown";
}
