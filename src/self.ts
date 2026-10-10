import semver from "semver";
import { normalizePath } from "./utils/paths";

/** How this copy of ccl-caut is being run, which decides the upgrade hint. */
export type InstallContext = "npx" | "global" | "project" | "source";

export interface ContextInput {
  /** Real path of the running entry script (process.argv[1], symlinks resolved). */
  entryPath: string;
  env: Readonly<Record<string, string | undefined>>;
  /** The folder holding the enclosing node_modules has a package.json (a project, not a global prefix). */
  insideProject: boolean;
  platform: NodeJS.Platform;
}

/**
 * - npx: npm runs it from its _npx cache (or sets npm_command=exec)
 * - source: not inside any node_modules (a git checkout or `npm link`)
 * - project: a node_modules whose parent folder is a project (has package.json)
 * - global: any other node_modules (global prefixes have no package.json)
 */
export function detectInstallContext({ entryPath, env, insideProject, platform }: ContextInput): InstallContext {
  const p = normalizePath(entryPath, platform);
  if (env.npm_command === "exec" || p.includes("/_npx/")) return "npx";
  if (!p.includes("/node_modules/")) return "source";
  return insideProject ? "project" : "global";
}

/** Folder that contains the innermost node_modules on the path, or null. */
export function nodeModulesParent(entryPath: string, platform: NodeJS.Platform): string | null {
  const p = normalizePath(entryPath, platform);
  const i = p.lastIndexOf("/node_modules/");
  return i < 0 ? null : entryPath.slice(0, i);
}
const UPGRADE_COMMAND: Record<InstallContext, string | null> = {
  npx: "npx ccl-caut@latest",
  global: "npm i -g ccl-caut",
  project: "npm i ccl-caut@latest",
  source: null, // a checkout updates with git
};

/** "ccl-caut 1.0.1 is available · npm i -g ccl-caut", or null when there is nothing to say. */
export function selfUpdateNotice(current: string, latest: string | null, context: InstallContext | null): string | null {
  if (!latest || !context) return null;
  const command = UPGRADE_COMMAND[context];
  const a = semver.valid(current);
  const b = semver.valid(latest);
  if (!command || !a || !b || !semver.gt(b, a)) return null;
  return `ccl-caut ${latest} is available · ${command}`;
}

/** Off in CI and with CCL_CAUT_NO_UPDATE_CHECK=1. */
export function selfCheckEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return !env.CI && env.CCL_CAUT_NO_UPDATE_CHECK !== "1";
}