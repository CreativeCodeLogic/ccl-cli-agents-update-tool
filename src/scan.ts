import type { BinaryInstance, InstallMethod, ToolDescriptor, ToolScan, ToolState, UpdatePlan } from "./types";
import type { VersionCache } from "./utils/cache";
import { getHost, pathFor, type Host } from "./utils/host";
import { classifyInstall } from "./utils/installMethod";
import { getNpmGlobalPaths } from "./utils/npm";
import { compareVersions } from "./utils/version";
import { projectPinFor, projectPinNote, type ProjectManifest } from "./project";
import { findAllExecutables } from "./utils/which";
import { wingetAvailability, wingetPlan } from "./utils/winget";

/** Descriptors promise never to reject; this enforces it anyway. */
async function safe<T>(fn: () => T | Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function safeSync<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
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
  /** Keys answered from an expired cache entry because the live lookup failed: key -> fetchedAt. */
  readonly stale = new Map<string, number>();

  constructor(
    readonly cache: VersionCache | null = null,
    private readonly refresh = false,
  ) {}

  static key(tool: ToolDescriptor, method?: InstallMethod, installedVersion?: string | null): string {
    return `${tool.id}:${tool.latestChannel?.(method, installedVersion) ?? "default"}`;
  }

  get(tool: ToolDescriptor, method?: InstallMethod, installedVersion?: string | null): Promise<string | null> {
    return this.getByKey(LatestResolver.key(tool, method, installedVersion), () => tool.getLatestVersion(method, installedVersion), true, tool.latestCacheTtlMs);
  }

  /** Cached value for `key` without any network (null when missing, expired or refreshing). */
  peek(key: string): string | null {
    return this.refresh ? null : (this.cache?.get(key)?.version ?? null);
  }

  /** Any keyed latest-version lookup (also used for ccl-caut itself), cached and de-duplicated. */
  getByKey(key: string, fetchLatest: () => Promise<string | null>, trackAge = true, ttlMs?: number): Promise<string | null> {
    let pending = this.pending.get(key);
    if (!pending) {
      pending = this.lookup(key, fetchLatest, trackAge, ttlMs);
      this.pending.set(key, pending);
    }
    return pending;
  }

  private async lookup(key: string, fetchLatest: () => Promise<string | null>, trackAge: boolean, ttlMs?: number): Promise<string | null> {
    const hit = this.refresh ? null : this.cache?.get(key, ttlMs);
    if (hit) {
      if (trackAge) this.oldestCachedAt = Math.min(this.oldestCachedAt ?? hit.fetchedAt, hit.fetchedAt);
      return hit.version;
    }
    const live = await safe(fetchLatest, null);
    if (live) {
      this.cache?.set(key, live);
      return live;
    }
    // Offline or a slow network: an old answer beats "unknown" (marked "cached 9h ago").
    const old = this.cache?.getStale(key);
    if (!old) return null;
    this.stale.set(key, old.fetchedAt);
    return old.version;
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
    tools.map(async (tool) => {
      const paths = findAllExecutables(tool.binNames, host);
      const claimed = await Promise.all(
        paths.map((p) => (tool.identify ? safe(() => tool.identify!({ path: p, realPath: host.fs.realpath(p) }), false) : true)),
      );
      return { tool, instances: await Promise.all(paths.filter((_, i) => claimed[i]).map((p) => detectInstance(tool, p, host))) };
    }),
  );
}

/**
 * State shown for a tool. Deprecated tools are "retired" whatever their version;
 * self-updating tools without a public latest version are "self-updating", not "unknown".
 */
export function deriveState(
  tool: Pick<ToolDescriptor, "deprecation" | "selfUpdating">,
  installedVersion: string | null | undefined,
  latestVersion: string | null,
  installed: boolean,
): { state: ToolState; updateAvailable: boolean } {
  if (!installed) return { state: "not-installed", updateAvailable: false };
  const compared = compareVersions(installedVersion ?? null, latestVersion);
  const updateAvailable = compared === "outdated";
  if (tool.deprecation) return { state: "retired", updateAvailable };
  if (compared === "unknown" && latestVersion === null && tool.selfUpdating) return { state: "self-updating", updateAvailable };
  return { state: compared, updateAvailable };
}

/**
 * Whether updating needs administrator rights / sudo. Already elevated: never.
 * Manual plans: when the descriptor says so or the command uses sudo.
 * Auto plans: when the folder the update writes to isn't writable.
 */
export function computeNeedsAdmin(
  tool: Pick<ToolDescriptor, "updateTargetDir">,
  instance: BinaryInstance | undefined,
  plan: UpdatePlan | null,
  host: Host,
  npmRoot: string | null,
): boolean {
  if (!instance || !plan || host.elevated) return false;
  if (plan.kind === "manual") {
    if (plan.needsAdmin !== undefined) return plan.needsAdmin;
    if (/^sudo\s/.test(plan.command)) return true;
    // A manual "npm install -g ..." still writes to the npm global root.
    if (/^npm\s+(install|i)\b.*\s-g\b/.test(plan.command)) return npmRoot ? !host.fs.isWritable(npmRoot) : false;
    // Otherwise the folder the tool says its update writes to (e.g. a pip site-packages).
    const target = tool.updateTargetDir?.(instance);
    return target ? !host.fs.isWritable(target) : false;
  }
  const isNpm = pathFor(host.platform).parse(plan.command[0] ?? "").name.toLowerCase() === "npm";
  const dir = tool.updateTargetDir?.(instance) ?? (isNpm && npmRoot ? npmRoot : pathFor(host.platform).dirname(instance.realPath));
  return dir ? !host.fs.isWritable(dir) : false;
}

/**
 * Phase 2: latest versions + state + update plan for the copy that runs, plus
 * info notes (vendor advice, and pins in `project`, the package.json of the
 * current directory if any). `onResult` hears about each tool as soon as it is
 * done (the live table); the returned array keeps the detection order.
 */
export function resolveLatest(
  detections: readonly Detection[],
  latest: LatestResolver,
  project: ProjectManifest | null = null,
  onResult?: (scan: ToolScan) => void,
): Promise<ToolScan[]> {
  return Promise.all(
    detections.map(async (detection) => {
      const scan = await resolveOne(detection, latest, project);
      onResult?.(scan);
      return scan;
    }),
  );
}

/**
 * What the live table shows for an installed tool before its latest version is
 * known: the installed side of the row only.
 */
export function pendingScan({ tool, instances }: Detection): ToolScan {
  const [active, ...others] = instances;
  return {
    id: tool.id,
    name: tool.name,
    shortName: tool.shortName ?? tool.name,
    group: tool.group,
    docsUrl: tool.docsUrl,
    installed: Boolean(active),
    installMethod: active?.installMethod ?? null,
    binaryPath: active?.path ?? null,
    installedVersion: active?.version ?? null,
    latestVersion: null,
    latestStaleCachedAt: null,
    state: "unknown",
    updateAvailable: false,
    needsAdmin: false,
    plan: null,
    shadowed: others.map((i) => ({ path: i.path, installMethod: i.installMethod, version: i.version })),
    deprecation: tool.deprecation ?? null,
    notes: [],
    projectPin: null,
    compatibility: null,
    waitingFor: null,
  };
}

async function resolveOne({ tool, instances }: Detection, latest: LatestResolver, project: ProjectManifest | null): Promise<ToolScan> {
  const [active, ...others] = instances;
  const rest: DetectedInstance[] = [];
  for (const other of others) {
    const delegated = active && tool.runsThrough ? await safe(() => tool.runsThrough!(active, other), false) : false;
    if (!delegated) rest.push(other);
  }
  const latestVersion = await latest.get(tool, active?.installMethod, active?.version);
  const staleAt = latest.stale.get(LatestResolver.key(tool, active?.installMethod, active?.version));
  let plan = active ? await safe<UpdatePlan | null>(() => tool.getUpdatePlan(active), null) : null;
  // winget installs: the allowlist and the install scope decide (utils/winget).
  if (active?.installMethod === "winget" && tool.winget) plan = wingetPlan(active, tool.winget, getHost());
  const { state, updateAvailable } = deriveState(tool, active?.version, latestVersion, Boolean(active));
  // The latest release may not install over this copy as it is (e.g. it needs a newer Python).
  const lookup = (key: string, fetch: () => Promise<string | null>) => latest.getByKey(key, fetch, false);
  let compatibility =
    active && latestVersion && updateAvailable && tool.checkCompatibility
      ? await safe(() => tool.checkCompatibility!(active, latestVersion, lookup), null)
      : null;
  // An automatic winget update only when winget already has the latest version.
  if (!compatibility && plan?.kind === "auto" && active?.installMethod === "winget" && tool.winget && latestVersion && updateAvailable) {
    const pkg = tool.winget;
    compatibility = await safe(() => wingetAvailability(pkg, tool.name, latestVersion, lookup), null);
  }
  if (compatibility) plan = compatibility.plan;
  const npmRoot = (await getNpmGlobalPaths())?.root ?? null;
  const needsAdmin = computeNeedsAdmin(tool, active, plan, getHost(), npmRoot);
  const projectPin = projectPinFor(tool, project, getHost());
  const notes = [
    ...(tool.notes ?? []),
    ...(active && tool.instanceNotes ? safeSync(() => tool.instanceNotes!(active), []) : []),
    ...(projectPin ? [projectPinNote(projectPin, tool.binNames[0] ?? tool.id)] : []),
  ];
  return {
    id: tool.id,
    name: tool.name,
    shortName: tool.shortName ?? tool.name,
    group: tool.group,
    docsUrl: tool.docsUrl,
    installed: Boolean(active),
    installMethod: active?.installMethod ?? null,
    binaryPath: active?.path ?? null,
    installedVersion: active?.version ?? null,
    latestVersion,
    latestStaleCachedAt: staleAt === undefined ? null : new Date(staleAt).toISOString(),
    state,
    updateAvailable,
    needsAdmin,
    plan,
    shadowed: rest.map((i) => ({ path: i.path, installMethod: i.installMethod, version: i.version })),
    deprecation: tool.deprecation ?? null,
    notes,
    projectPin,
    compatibility: compatibility?.message ?? null,
    waitingFor: compatibility?.waiting ?? null,
  };
}

export interface ScanSummary {
  total: number;
  upToDate: number;
  outdated: number;
  notInstalled: number;
  unknown: number;
  retired: number;
  selfUpdating: number;
  shadowed: number;
  /** Latest versions taken from an expired cache because the live lookup failed. */
  stale: number;
}

export function summarize(results: readonly ToolScan[]): ScanSummary {
  const count = (state: ToolScan["state"]) => results.filter((r) => r.state === state).length;
  return {
    total: results.length,
    upToDate: count("up-to-date"),
    outdated: count("outdated"),
    notInstalled: count("not-installed"),
    unknown: count("unknown"),
    retired: count("retired"),
    selfUpdating: count("self-updating"),
    shadowed: results.filter((r) => r.shadowed.length > 0).length,
    stale: results.filter((r) => r.latestStaleCachedAt !== null).length,
  };
}
