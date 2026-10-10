/** How a CLI was installed on this machine. */
export type InstallMethod = "npm" | "native" | "brew" | "pip" | "apt" | "snap" | "unknown";

/**
 * What to do to update a tool.
 * - "auto": safe for us to run on the user's behalf.
 * - "manual": printed for the user to copy; never executed.
 */
export type UpdatePlan =
  | { kind: "auto"; command: string[] }
  | { kind: "manual"; command: string; reason: string };

/** One entry in the tool registry. Every method must resolve, never reject. */
export interface ToolDescriptor {
  id: string;
  name: string;
  /** Executable names to look for on PATH (extensions are resolved per platform). */
  binNames: string[];
  /** Absolute path of the executable that would run from PATH, or null. */
  getBinaryPath(): Promise<string | null>;
  /** null = not installed. */
  detectInstallMethod(): Promise<InstallMethod | null>;
  getInstalledVersion(): Promise<string | null>;
  getLatestVersion(): Promise<string | null>;
  getUpdatePlan(method: InstallMethod): UpdatePlan;
}

export type ToolState = "up-to-date" | "outdated" | "not-installed" | "unknown";

/** Result of scanning a single tool. */
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
}
