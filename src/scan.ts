import type { InstallMethod, ToolDescriptor, ToolScan } from "./types";
import { compareVersions } from "./utils/version";

/** Descriptors promise never to reject; this enforces it anyway. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export interface Detection {
  tool: ToolDescriptor;
  binaryPath: string | null;
  installMethod: InstallMethod | null;
  installedVersion: string | null;
}

/**
 * Kick off latest-version lookups early so network latency overlaps with
 * local detection. Descriptors cache their lookups, so resolveLatest()
 * picks up these same in-flight requests.
 */
export function prefetchLatest(tools: readonly ToolDescriptor[]): void {
  for (const tool of tools) void safe(() => tool.getLatestVersion(), null);
}

/** Phase 1: locate every tool and read its installed version, in parallel. */
export function detectAll(tools: readonly ToolDescriptor[]): Promise<Detection[]> {
  return Promise.all(
    tools.map(async (tool) => {
      const installMethod = await safe(() => tool.detectInstallMethod(), null);
      if (!installMethod) return { tool, binaryPath: null, installMethod: null, installedVersion: null };
      const [binaryPath, installedVersion] = await Promise.all([
        safe(() => tool.getBinaryPath(), null),
        safe(() => tool.getInstalledVersion(), null),
      ]);
      return { tool, binaryPath, installMethod, installedVersion };
    }),
  );
}

/** Phase 2: fetch latest versions in parallel and derive state + update plan. */
export function resolveLatest(detections: readonly Detection[]): Promise<ToolScan[]> {
  return Promise.all(
    detections.map(async ({ tool, binaryPath, installMethod, installedVersion }) => {
      const latestVersion = await safe(() => tool.getLatestVersion(), null);
      const installed = installMethod !== null;
      let plan = null;
      if (installed) {
        try {
          plan = tool.getUpdatePlan(installMethod);
        } catch {
          plan = null;
        }
      }
      return {
        id: tool.id,
        name: tool.name,
        installed,
        installMethod,
        binaryPath,
        installedVersion,
        latestVersion,
        state: installed ? compareVersions(installedVersion, latestVersion) : "not-installed",
        plan,
      } satisfies ToolScan;
    }),
  );
}

export interface ScanSummary {
  total: number;
  upToDate: number;
  outdated: number;
  notInstalled: number;
  unknown: number;
}

export function summarize(results: readonly ToolScan[]): ScanSummary {
  const count = (state: ToolScan["state"]) => results.filter((r) => r.state === state).length;
  return {
    total: results.length,
    upToDate: count("up-to-date"),
    outdated: count("outdated"),
    notInstalled: count("not-installed"),
    unknown: count("unknown"),
  };
}
