import type { BinaryInstance, ToolDescriptor, ToolScan, UpdatePlan } from "./types";
import { classifyInstall } from "./utils/installMethod";
import { compareVersions } from "./utils/version";
import { findAllExecutables, safeRealpath } from "./utils/which";

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

async function detectInstance(tool: ToolDescriptor, binPath: string): Promise<DetectedInstance> {
  const realPath = safeRealpath(binPath);
  const generic = await safe(() => classifyInstall(binPath, realPath), "unknown" as const);
  const installMethod = tool.refineInstallMethod
    ? await safe(() => tool.refineInstallMethod!(generic, { path: binPath, realPath }), generic)
    : generic;
  const instance: BinaryInstance = { path: binPath, realPath, installMethod };
  const version = await safe(() => tool.getInstalledVersion(instance), null);
  return { ...instance, version };
}

/**
 * Kick off latest-version lookups early so network latency overlaps with
 * local detection. Lookups are cached, so resolveLatest() picks up these
 * same in-flight requests.
 */
export function prefetchLatest(tools: readonly ToolDescriptor[]): void {
  for (const tool of tools) void safe(() => tool.getLatestVersion(), null);
}

/** Phase 1: find every copy of every tool and read its version, in parallel. */
export function detectAll(tools: readonly ToolDescriptor[]): Promise<Detection[]> {
  return Promise.all(
    tools.map(async (tool) => ({
      tool,
      instances: await Promise.all(findAllExecutables(tool.binNames).map((p) => detectInstance(tool, p))),
    })),
  );
}

/** Phase 2: latest versions + state + update plan for the copy that runs. */
export function resolveLatest(detections: readonly Detection[]): Promise<ToolScan[]> {
  return Promise.all(
    detections.map(async ({ tool, instances }): Promise<ToolScan> => {
      const [active, ...others] = instances;
      const rest: DetectedInstance[] = [];
      for (const other of others) {
        const delegated = active && tool.runsThrough ? await safe(() => tool.runsThrough!(active, other), false) : false;
        if (!delegated) rest.push(other);
      }
      const latestVersion = await safe(() => tool.getLatestVersion(active?.installMethod), null);
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
