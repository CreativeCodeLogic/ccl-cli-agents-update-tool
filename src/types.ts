/** How a CLI was installed. "node" = npm bundled with a Node.js install. */
export type InstallMethod =
  | "npm"
  | "native"
  | "node"
  | "brew"
  | "pip"
  | "uv"
  | "pipx"
  | "apt"
  | "snap"
  | "winget"
  | "choco"
  | "scoop"
  | "unknown";

/** Table/checklist section: AI coding agents, or developer CLIs (cloud, hosting, package managers). */
/** "self": CCL CAUT's own checklist row (not a registry group: never hidden, not in --discover). */
export type ToolGroup = "agents" | "dev" | "self";

export const TOOL_GROUPS: readonly ToolGroup[] = ["agents", "dev"];

/** Heading shown above each group. */
export const GROUP_LABELS: Record<ToolGroup, string> = { agents: "AI agents", dev: "Dev CLIs", self: "CCL CAUT" };

/**
 * Advice shown after the table (dim cyan "i"). It never changes a row's state
 * or whether the tool is preselected.
 */
export interface ToolNote {
  kind: "info";
  message: string;
  url?: string;
}

/** The current project pins its own copy of a tool (see project.ts). Read-only. */
export interface ProjectPin {
  /** package.json that declares it. */
  packageJson: string;
  pkg: string;
  range: string;
  field: "dependencies" | "devDependencies" | "optionalDependencies";
  /** Version in the project's node_modules, when installed. */
  installedVersion: string | null;
}

/** A tool that still works for some users but has been retired or replaced. */
export interface Deprecation {
  /** One line, shown after the table, e.g. "retired for consumer accounts since Jun 2026 -> use ...". */
  message: string;
  /** Registry id of the replacement, if any. */
  successorId?: string;
  /** ISO date the deprecation took effect. */
  since?: string;
  /** Official announcement. */
  url?: string;
}

/**
 * What to do to update a tool.
 * - "auto": safe for us to run on the user's behalf.
 * - "manual": printed for the user to copy; never executed.
 */
export type UpdatePlan =
  | { kind: "auto"; command: string[] }
  | { kind: "manual"; command: string; reason: string; /** Needs an elevated terminal / sudo. */ needsAdmin?: boolean };

/** A cached, de-duplicated lookup for one run (latest-version cache; null = unknown). */
export type KeyedLookup = (key: string, fetch: () => Promise<string | null>) => Promise<string | null>;

/** The latest release can't run on this install as it is (e.g. it needs a newer Python). */
export interface Compatibility {
  /** One sentence, shown as a note and in the plan's reason. */
  message: string;
  /** What to do instead (manual, never preselected). */
  plan: UpdatePlan;
}

import type { WingetPackage } from "./utils/winget";

/** One copy of a tool's executable found on PATH. */
export interface BinaryInstance {
  /** Path as found on PATH (e.g. a Windows .cmd shim or a POSIX symlink). */
  path: string;
  /** Symlinks resolved. */
  realPath: string;
  installMethod: InstallMethod;
}

/** One entry in the tool registry. Every method must resolve, never reject. */
export interface ToolDescriptor {
  id: string;
  name: string;
  /** Executable names to look for on PATH (extensions are resolved per platform). */
  binNames: string[];
  /** Short name for compact lists (defaults to `name`). */
  shortName?: string;
  /** Section in the table and checklist. */
  group: ToolGroup;
  /** One line for --discover. */
  description: string;
  /** The tool's OFFICIAL install docs (ccl-caut never installs tools). */
  docsUrl: string;
  /** npm package that ships this CLI, if any (used in messages and the project-copy check). */
  npmPackage?: string;
  /**
   * npm packages a project would pin for this tool, when they differ from
   * npmPackage (e.g. a CLI shipped natively whose project package is "supabase").
   */
  projectPackages?: string[];
  /** Retired/replaced: shown as "retired" and never preselected for updates. */
  deprecation?: Deprecation;
  /** Vendor advice shown as info notes after the table (never changes state or preselection). */
  notes?: ToolNote[];
  /** Notes that depend on the copy that runs (e.g. an old package name to migrate from). */
  instanceNotes?(instance: BinaryInstance): ToolNote[];
  /**
   * The tool updates itself and has no public latest-version source: an unknown
   * latest version is shown as "updates itself" (not "unknown"), and its own
   * update command is offered unticked.
   */
  selfUpdating?: boolean;
  /** Adjust the generic, path-based install method for this tool. */
  refineInstallMethod?(
    generic: InstallMethod,
    instance: Omit<BinaryInstance, "installMethod">,
  ): InstallMethod | Promise<InstallMethod>;
  /**
   * True when `other` (later on PATH) is what `active` actually executes, e.g. a
   * shim that delegates to another install. Such copies are not reported as shadowed.
   */
  runsThrough?(active: BinaryInstance, other: BinaryInstance): boolean | Promise<boolean>;
  /**
   * For generic binary names (e.g. Cursor's `agent`, `amp`, `goose`, `vibe`):
   * false = this file is some other program, shown as not installed. Decided by
   * install location, symlink target or package metadata; a tool may confirm an
   * ambiguous location with a harmless --version signature, but never runs a
   * binary it hasn't located first.
   */
  identify?(instance: Omit<BinaryInstance, "installMethod">): boolean | Promise<boolean>;
  getInstalledVersion(instance: BinaryInstance): Promise<string | null>;
  /**
   * Latest release for an install channel (channels can differ, e.g. legacy pip
   * builds, or OpenCode v1 vs v2 told apart by the installed major version).
   */
  getLatestVersion(method?: InstallMethod, installedVersion?: string | null): Promise<string | null>;
  getUpdatePlan(instance: BinaryInstance): Promise<UpdatePlan>;
  /** Folder an automatic update writes to (default: npm global root for npm, else the binary's folder). */
  updateTargetDir?(instance: BinaryInstance): string | null;
  /** How long a looked-up latest version stays fresh (default 1h; GitHub-sourced tools use 6h). */
  latestCacheTtlMs?: number;
  /** Cache key for latest-version lookups per install method (default: one channel per tool). */
  latestChannel?(method?: InstallMethod, installedVersion?: string | null): string;
  /**
   * Explain an update command that succeeded but left the version unchanged,
   * when that is expected (e.g. a staged rollout), judging by the command's
   * output. null = genuinely unchanged (reported as a warning).
   */
  explainUnchanged?(instance: BinaryInstance, output: string): { status: "held"; message: string } | null;
  /**
   * When an update is available: whether the latest release can be installed
   * over this copy (e.g. its Python version). null = fine, or unknown.
   */
  checkCompatibility?(instance: BinaryInstance, latestVersion: string, lookup: KeyedLookup): Promise<Compatibility | null>;
  /**
   * Its winget package. Plans for winget installs come from here (utils/winget):
   * `auto: true` is the allowlist, set only after a real silent upgrade passed.
   */
  winget?: WingetPackage;
}

export type ToolState =
  | "up-to-date"
  | "outdated"
  | "not-installed"
  | "unknown"
  /** Deprecated tool (see ToolScan.deprecation); `updateAvailable` still says if a newer build exists. */
  | "retired"
  /** No public latest version; the tool keeps itself current. */
  | "self-updating";

/** A copy of the tool that is installed but never runs because an earlier PATH entry wins. */
export interface ShadowedInstall {
  path: string;
  installMethod: InstallMethod;
  version: string | null;
}

/** Result of scanning a single tool. Everything except `shadowed` describes the copy that runs. */
export interface ToolScan {
  id: string;
  name: string;
  shortName: string;
  group: ToolGroup;
  docsUrl: string;
  installed: boolean;
  installMethod: InstallMethod | null;
  binaryPath: string | null;
  installedVersion: string | null;
  latestVersion: string | null;
  /** Set (ISO time) when the live lookup failed and latestVersion comes from an expired cache entry. */
  latestStaleCachedAt: string | null;
  state: ToolState;
  /** A newer version is known (true for "outdated", and for "retired" tools that are behind). */
  updateAvailable: boolean;
  /** Updating needs administrator rights / sudo (false when ccl-caut already runs elevated). */
  needsAdmin: boolean;
  plan: UpdatePlan | null;
  shadowed: ShadowedInstall[];
  deprecation: Deprecation | null;
  /** Info notes for this row (vendor advice, project pins); never affect state or preselection. */
  notes: ToolNote[];
  /** The project in the current directory pins its own copy of this tool. */
  projectPin: ProjectPin | null;
  /** Set when the latest release can't simply be updated to (e.g. it needs a newer Python); the plan says what to do. */
  compatibility: string | null;
}
