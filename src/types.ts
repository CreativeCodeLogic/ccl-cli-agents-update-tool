/** How a CLI was installed. "node" = npm bundled with a Node.js install. */
export type InstallMethod =
  | "npm"
  | "native"
  | "node"
  | "brew"
  | "pip"
  | "apt"
  | "snap"
  | "winget"
  | "choco"
  | "scoop"
  | "unknown";

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
  | { kind: "manual"; command: string; reason: string };

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
  /** npm package that ships this CLI, if any (used in messages). */
  npmPackage?: string;
  /** Retired/replaced: shown as "retired" and never preselected for updates. */
  deprecation?: Deprecation;
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
   * For generic binary names (e.g. Cursor's `agent`): false = this file is some
   * other program and is ignored. Path-based; never runs unknown binaries.
   */
  identify?(instance: Omit<BinaryInstance, "installMethod">): boolean;
  getInstalledVersion(instance: BinaryInstance): Promise<string | null>;
  /**
   * Latest release for an install channel (channels can differ, e.g. legacy pip
   * builds, or OpenCode v1 vs v2 told apart by the installed major version).
   */
  getLatestVersion(method?: InstallMethod, installedVersion?: string | null): Promise<string | null>;
  getUpdatePlan(instance: BinaryInstance): Promise<UpdatePlan>;
  /** Cache key for latest-version lookups per install method (default: one channel per tool). */
  latestChannel?(method?: InstallMethod, installedVersion?: string | null): string;
  /**
   * Explain an update command that succeeded but left the version unchanged,
   * when that is expected (e.g. a staged rollout). null = genuinely unchanged.
   */
  explainUnchanged?(instance: BinaryInstance): { status: "held"; message: string } | null;
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
  installed: boolean;
  installMethod: InstallMethod | null;
  binaryPath: string | null;
  installedVersion: string | null;
  latestVersion: string | null;
  state: ToolState;
  /** A newer version is known (true for "outdated", and for "retired" tools that are behind). */
  updateAvailable: boolean;
  plan: UpdatePlan | null;
  shadowed: ShadowedInstall[];
  deprecation: Deprecation | null;
}
