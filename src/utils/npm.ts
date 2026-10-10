import { readFile } from "node:fs/promises";
import path from "node:path";
import { debug } from "./debug";
import { exec } from "./exec";

const REGISTRY = "https://registry.npmjs.org";
const FETCH_TIMEOUT_MS = 5_000;
const FETCH_ATTEMPTS = 2;

export interface NpmGlobalPaths {
  /** Global prefix: bins live here on Windows, in <prefix>/bin elsewhere. */
  prefix: string;
  /** Global node_modules directory. */
  root: string;
}

let globalPaths: Promise<NpmGlobalPaths | null> | undefined;

/** `npm prefix -g` + `npm root -g`, resolved once per run. */
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

/** Version from <npm root -g>/<pkg>/package.json, or null. */
export async function readGlobalPackageVersion(pkg: string): Promise<string | null> {
  const paths = await getNpmGlobalPaths();
  if (!paths) return null;
  try {
    const raw = await readFile(path.join(paths.root, ...pkg.split("/"), "package.json"), "utf8");
    const version: unknown = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

async function fetchLatestOnce(pkg: string): Promise<string | null> {
  const res = await fetch(`${REGISTRY}/${pkg}/latest`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { version?: unknown };
  return typeof body.version === "string" ? body.version : null;
}

const latestCache = new Map<string, Promise<string | null>>();

/**
 * Latest published version from the npm registry: 5s timeout per attempt,
 * one retry (cold DNS/TLS to the registry can approach the timeout).
 * Cached per run; null on failure.
 */
export function fetchLatestNpmVersion(pkg: string): Promise<string | null> {
  let pending = latestCache.get(pkg);
  if (!pending) {
    pending = (async () => {
      for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
        try {
          return await fetchLatestOnce(pkg);
        } catch (error) {
          debug(`registry lookup for ${pkg} failed (attempt ${attempt}): ${String(error)}`);
        }
      }
      return null;
    })();
    latestCache.set(pkg, pending);
  }
  return pending;
}
