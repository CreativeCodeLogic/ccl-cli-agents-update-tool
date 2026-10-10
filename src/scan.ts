import type { BinaryInstance, InstallMethod, ToolDescriptor, ToolScan, UpdatePlan } from "./types";
import type { VersionCache } from "./utils/cache";
import { getHost, type Host } from "./utils/host";
import { classifyInstall } from "./utils/installMethod";
import { getNpmGlobalPaths } from "./utils/npm";
import { compareVersions } from "./utils/version";
import { findAllExecutables } from "./utils/which";

/** Descriptors promise never to reject; this enforces it anyway. */
async function safe<T>(fn: () => T | Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export interface DetectedInstance extends BinaryInstance {
  version: string | null;
}

export interface Detection {
  tool: ToolDescriptor;
  /** Every copy on PATH, in PATH order: [0] runs, the rest are shadowed. */
  instances: DetectedInstance[];
}

/**
 * Latest-version lookups for one run: disk cache first (unless refreshing),
 * then live, each key fetched at most once. Tracks the oldest cached value used.
 */
export class LatestResolver {
  private readonly pending = new Map<string, Promise<string | null>>();
  /** fetchedAt of the oldest cached value served this run, if any. */
  oldestCachedAt: number | null = null;

  constructor(
    readonly cache: VersionCache | null = null,
    private readonly refresh = false,
  ) {}

  static key(tool: ToolDescriptor, method?: InstallMethod): string {
    return `${tool.id}:${tool.latestChannel?.(method) ?? "default"}`;
  }

  get(tool: ToolDescriptor, method?: InstallMethod): Promise<string | null> {
    const key = LatestResolver.key(tool, method);
    let pending = this.pending.get(key);
    if (!pending) {
      pending = this.lookup(tool, method, key);
      this.pending.set(key, pending);
    }
    return pending;
  }

  private async lookup(tool: ToolDescriptor, method: InstallMethod | undefined, key: string): Promise<string | null> {
    const hit = this.refresh ? null : this.cache?.get(key);
    if (hit) {
      this.oldestCachedAt = Math.min(this.oldestCachedAt ?? hit.fetchedAt, hit.fetchedAt);
      return hit.version;
    }
    const live = await safe(() => tool.getLatestVersion(method), null);
    if (live) this.cache?.set(key, live);
    return live;
  }
}

async function detectInstance(tool: ToolDescriptor, binPath: string, host: Host): Promise<DetectedInstance> {
  const realPath = host.fs.realpath(binPath);
  const npmGlobal = await getNpmGlobalPaths();
  const generic = classifyInstall(binPath, realPath, { host, npmGlobal });
  const installMethod = tool.refineInstallMethod
    ? await safe(() => tool.refineInstallMethod!(generic, { path: binPath, realPath }), generic)
    : generic;
  const instance: BinaryInstance = { path: binPath, realPath, installMethod };
  const version = await safe(() => tool.getInstalledVersion(instance), null);
  return { ...instance, version };
}

/**
 * Kick off latest-version lookups early so network latency overlaps with
 * local detection; resolveLatest() picks up the same in-flight requests.
 */
export function prefetchLatest(tools: readonly ToolDescriptor[], latest: LatestResolver): void {
  for (const tool of tools) void latest.get(tool);
}

/** Phase 1: find every copy of every tool and read its version, in parallel. */
export function detectAll(tools: readonly ToolDescriptor[], host: Host = getHost()): Promise<Detection[]> {
  return Promise.all(
    tools.map(async (tool) => ({
      tool,
      instances: await Promise.all(findAllExecutables(tool.binNames, host).map((p) => detectInstance(tool, p, host))),
    })),
  );
}

/** Phase 2: latest versions + state + update plan for the copy that runs. */
export function resolveLatest(detections: readonly Detection[], latest: LatestResolver): Promise<ToolScan[]> {
  return Promise.all(
    detections.map(async ({ tool, instances }): Promise<ToolScan> => {
      const [active, ...others] = instances;
      const rest: DetectedInstance[] = [];
      for (const other of others) {
        const delegated = active && tool.runsThrough ? await safe(() => tool.runsThrough!(active, other), false) : false;
        if (!delegated) rest.push(other);
      }
      const latestVersion = await latest.get(tool, active?.installMethod);
      const plan = active ? await safe<UpdatePlan | null>(() => tool.getUpdatePlan(active), null) : null;
      return {
        id: tool.id,
        name: tool.name,
        installed: Boolean(active),
        installMethod: active?.installMethod ?? null,
        binaryPath: active?.path ?? null,
        installedVersion: active?.version ?? null,
        latestVersion,
        state: active ? compareVersions(active.version, latestVersion) : "not-installed",
        plan,
        shadowed: rest.map((i) => ({ path: i.path, installMethod: i.installMethod, version: i.version })),
      };
    }),
  );
}

export interface ScanSummary {
  total: number;
  upToDate: number;
  outdated: number;
  notInstalled: number;
  unknown: number;
  shadowed: number;
}

export function summarize(results: readonly ToolScan[]): ScanSummary {
  const count = (state: ToolScan["state"]) => results.filter((r) => r.state === state).length;
  return {
    total: results.length,
    upToDate: count("up-to-date"),
    outdated: count("outdated"),
    notInstalled: count("not-installed"),
    unknown: count("unknown"),
    shadowed: results.filter((r) => r.shadowed.length > 0).length,
  };
}
