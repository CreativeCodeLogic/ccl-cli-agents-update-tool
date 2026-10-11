import type { InstallMethod } from "../types";
import { envVar, pathFor, type Host } from "./host";
import type { NpmGlobalPaths } from "./npm";
import { isInside, normalizePath, samePath } from "./paths";

export interface ClassifyContext {
  host: Host;
  /** Global prefix/root of the npm on PATH, or null when npm is unavailable. */
  npmGlobal: NpmGlobalPaths | null;
}

/** Executables that ship inside a Node.js install. */
const NODE_BUNDLED = new Set(["npm", "npx", "corepack"]);
/** Homebrew-managed packages live in Cellar (formulae) or Caskroom (casks); a bare Homebrew prefix is not enough. */
const BREW_SEGMENTS = new Set(["cellar", "caskroom"]);
/** Python package managers, recognized by their environment folders (see python.ts for the documented roots). */
const PYTHON_SEGMENTS: [string, InstallMethod][] = [
  ["/uv/tools/", "uv"],
  ["/uv/data/tools/", "uv"],
  ["/pipx/venvs/", "pipx"],
  ["/site-packages/", "pip"],
  ["/dist-packages/", "pip"],
];
/** bin directories that only Homebrew populates (Intel /usr/local/bin is shared, so it needs the Cellar check). */
const HOMEBREW_BIN_DIRS = new Set(["/opt/homebrew/bin", "/home/linuxbrew/.linuxbrew/bin"]);

function segments(p: string): string[] {
  return p.toLowerCase().split("/");
}

/** Volta: ~/.volta (POSIX) or %LOCALAPPDATA%/Volta (Windows). */
export function isVoltaPath(p: string, host: Host): boolean {
  if (segments(normalizePath(p, host.platform)).includes(".volta")) return true;
  const localAppData = host.platform === "win32" ? envVar(host, "LOCALAPPDATA") : undefined;
  return localAppData !== undefined && isInside(p, pathFor(host.platform).join(localAppData, "Volta"), host.platform);
}

/** Windows package managers, recognized by where they put files. */
function windowsPackageManager(p: string, host: Host): InstallMethod | null {
  const path = pathFor(host.platform);
  const local = envVar(host, "LOCALAPPDATA");
  const wingetRoots = [
    local && path.join(local, "Microsoft", "WinGet"), // per-user portable packages + Links
    envVar(host, "ProgramFiles") && path.join(envVar(host, "ProgramFiles")!, "WinGet"), // machine scope
  ];
  if (wingetRoots.some((root) => root && isInside(p, root, host.platform))) return "winget";
  const choco = envVar(host, "ChocolateyInstall") ?? "C:\x5cProgramData\x5cchocolatey";
  if (isInside(p, choco, host.platform)) return "choco";
  const scoop = envVar(host, "SCOOP") ?? (host.homedir && path.join(host.homedir, "scoop"));
  if (scoop && isInside(p, scoop, host.platform)) return "scoop";
  return null;
}

/** Install roots of vendor "native" installers. */
function isNativeLocation(p: string, { host }: ClassifyContext): boolean {
  const { platform, homedir } = host;
  const path = pathFor(platform);
  if (homedir && isInside(p, path.join(homedir, ".local", "bin"), platform)) return true; // Claude Code, many installers
  if (homedir && isInside(p, homedir, platform)) {
    // ~/.<vendor>/bin, e.g. ~/.kimi-code/bin
    const rel = normalizePath(p, platform).slice(normalizePath(homedir, platform).length + 1).split("/");
    if (rel.length >= 3 && rel[0]?.startsWith(".") && rel[1] === "bin") return true;
  }
  if (platform === "win32") {
    const localAppData = envVar(host, "LOCALAPPDATA");
    const roots = [
      localAppData && path.join(localAppData, "Programs"),
      envVar(host, "ProgramFiles"),
      envVar(host, "ProgramFiles(x86)"),
    ];
    return roots.some((root) => root && isInside(p, root, platform));
  }
  return isInside(p, "/opt", platform);
}

/**
 * Best-effort guess of how one executable was installed, from where it (and
 * its symlink target) lives. Pure: everything comes from `ctx`.
 * Order matters: npm globals of a Homebrew Node live under the Homebrew prefix,
 * Homebrew-packaged node apps contain "node_modules" inside Cellar, and on
 * Debian `npm root -g` lives under /usr/lib.
 * Tools can refine the result (see ToolDescriptor.refineInstallMethod).
 */
export function classifyInstall(binPath: string, realPath: string, ctx: ClassifyContext): InstallMethod {
  const { host, npmGlobal } = ctx;
  const { platform } = host;
  const path = pathFor(platform);
  const isWindows = platform === "win32";
  const paths = [normalizePath(binPath, platform), normalizePath(realPath, platform)];
  const any = (test: (p: string) => boolean) => paths.some(test);

  if (any((p) => p.startsWith("/snap/"))) return "snap";

  const binDir = path.dirname(binPath);
  const name = path.parse(binPath).name.toLowerCase();
  const siblingNode = path.join(binDir, isWindows ? "node.exe" : "node");
  if (NODE_BUNDLED.has(name) && host.fs.exists(siblingNode)) {
    // npm that ships with Homebrew's Node is upgraded with `brew upgrade node`.
    const nodeReal = normalizePath(host.fs.realpath(siblingNode), platform);
    const brewNode = segments(nodeReal).some((s) => BREW_SEGMENTS.has(s)) || HOMEBREW_BIN_DIRS.has(normalizePath(binDir, platform));
    return brewNode ? "brew" : "node";
  }

  // POSIX global bins are symlinks into the root; Windows uses shims in the prefix.
  // (Matching /usr/bin by directory alone would mislabel apt packages.)
  if (npmGlobal) {
    if (isInside(realPath, npmGlobal.root, platform)) return "npm";
    if (isWindows && samePath(binDir, npmGlobal.prefix, platform)) return "npm";
  }
  if (any((p) => segments(p).some((s) => BREW_SEGMENTS.has(s)))) return "brew";

  // Globals of other Node installs (nvm, volta, fnm, ...).
  if (any((p) => p.includes("/node_modules/"))) return "npm";
  if (isWindows && host.fs.exists(path.join(binDir, "node_modules"))) return "npm";

  // Volta shims resolve to Volta itself, not to node_modules.
  if (isVoltaPath(binPath, host)) return "npm";

  for (const [segment, method] of PYTHON_SEGMENTS) if (any((p) => p.includes(segment))) return method;

  if (isWindows) {
    const manager = windowsPackageManager(binPath, host) ?? windowsPackageManager(realPath, host);
    if (manager) return manager;
  }

  if (any((p) => p.startsWith("/usr/bin/") || p.startsWith("/usr/lib/") || p.startsWith("/usr/share/"))) {
    return "apt";
  }

  if (isNativeLocation(binPath, ctx) || isNativeLocation(realPath, ctx)) return "native";
  return "unknown";
}
