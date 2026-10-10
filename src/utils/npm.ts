import { readFile } from "node:fs/promises";
import { exec } from "./exec";
import { getHost, pathFor, type Host } from "./host";
import { fetchJson, stringField } from "./http";
import { isInside, samePath } from "./paths";

export interface NpmGlobalPaths {
  /** Global prefix: bins live here on Windows, in <prefix>/bin elsewhere. */
  prefix: string;
  /** Global node_modules directory. */
  root: string;
}

let globalPaths: Promise<NpmGlobalPaths | null> | undefined;

/** `npm prefix -g` + `npm root -g` of the npm on PATH, resolved once per run. */
export function getNpmGlobalPaths(): Promise<NpmGlobalPaths | null> {
  globalPaths ??= (async () => {
    const [prefix, root] = await Promise.all([
      exec("npm", ["prefix", "-g"]),
      exec("npm", ["root", "-g"]),
    ]);
    if (!prefix.ok || !root.ok) return null;
    const p = prefix.stdout.trim();
    const r = root.stdout.trim();
    return p && r ? { prefix: p, root: r } : null;
  })();
  return globalPaths;
}

/** Use known global paths instead of asking npm (tests, or callers that already know). */
export function primeNpmGlobalPaths(paths: NpmGlobalPaths | null): void {
  globalPaths = Promise.resolve(paths);
}

/**
 * True if this executable belongs to the global prefix of the npm on PATH,
 * i.e. `npm install -g` would actually replace it.
 */
export async function isInCurrentNpmGlobal(binPath: string, realPath: string, host: Host = getHost()): Promise<boolean> {
  const npm = await getNpmGlobalPaths();
  if (!npm) return false;
  if (isInside(realPath, npm.root, host.platform)) return true;
  // Windows shims are plain files in the prefix, not symlinks.
  return host.platform === "win32" && samePath(pathFor(host.platform).dirname(binPath), npm.prefix, host.platform);
}

async function readVersionIfNamed(pkgJson: string, pkg: string): Promise<string | null> {
  try {
    const json: unknown = JSON.parse(await readFile(pkgJson, "utf8"));
    return stringField(json, "name") === pkg ? stringField(json, "version") : null;
  } catch {
    return null;
  }
}

/**
 * Version of `pkg` that backs this executable, read from package.json:
 * - next to a Windows shim: <dir>/node_modules/<pkg>/package.json
 * - above a POSIX symlink target: walk up from the real path.
 * Works for any prefix (nvm, volta, ...), not just the current global one.
 */
export async function readPackageVersionNear(
  binPath: string,
  realPath: string,
  pkg: string,
  host: Host = getHost(),
): Promise<string | null> {
  const path = pathFor(host.platform);
  const candidates = [path.join(path.dirname(binPath), "node_modules", ...pkg.split("/"), "package.json")];
  let dir = path.dirname(realPath);
  for (let i = 0; i < 5; i++) {
    candidates.push(path.join(dir, "package.json"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const file of candidates) {
    if (!host.fs.exists(file)) continue;
    const version = await readVersionIfNamed(file, pkg);
    if (version) return version;
  }
  return null;
}

/** Latest version published to the npm registry, or null. */
export async function fetchLatestNpmVersion(pkg: string): Promise<string | null> {
  return stringField(await fetchJson(`https://registry.npmjs.org/${pkg}/latest`), "version");
}
