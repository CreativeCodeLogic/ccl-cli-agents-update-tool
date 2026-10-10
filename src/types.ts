/** How a CLI was installed. "node" = npm bundled with a Node.js install. */
export type InstallMethod = "npm" | "native" | "node" | "brew" | "pip" | "apt" | "snap" | "unknown";

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
  /** npm package that ships this CLI, if any (used in messages). */
  npmPackage?: string;
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
  getInstalledVersion(instance: BinaryInstance): Promise<string | null>;
  /** Latest release for the given install channel (channels can differ, e.g. legacy pip builds). */
  getLatestVersion(method?: InstallMethod): Promise<string | null>;
  getUpdatePlan(instance: BinaryInstance): Promise<UpdatePlan>;
  /** Cache key for latest-version lookups per install method (default: one channel per tool). */
  latestChannel?(method?: InstallMethod): string;
  /**
   * Explain an update command that succeeded but left the version unchanged,
   * when that is expected (e.g. a staged rollout). null = genuinely unchanged.
   */
  explainUnchanged?(instance: BinaryInstance): { status: "held"; message: string } | null;
}

export type ToolState = "up-to-date" | "outdated" | "not-installed" | "unknown";

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
  installed: boolean;
  installMethod: InstallMethod | null;
  binaryPath: string | null;
  installedVersion: string | null;
  latestVersion: string | null;
  state: ToolState;
  plan: UpdatePlan | null;
  shadowed: ShadowedInstall[];
}
