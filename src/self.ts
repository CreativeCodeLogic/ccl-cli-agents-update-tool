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

/** The same commands for the beta channel (the "next" dist-tag). */
const NEXT_COMMAND: Record<InstallContext, string | null> = {
  npx: "npx ccl-caut@next",
  global: "npm i -g ccl-caut@next",
  project: "npm i ccl-caut@next",
  source: null,
};

/**
 * The version to move to, or null: `latest` when it is newer; for a prerelease
 * also `next` when it is newer still. Never a downgrade, never a beta for
 * stable users. Shared by the notice and the checklist row.
 */
export function selfUpdateTarget(current: string, latest: string | null, next: string | null = null): { version: string; channel: "latest" | "next" } | null {
  const a = semver.valid(current);
  if (!a) return null;
  const candidates: { version: string; channel: "latest" | "next" }[] = [];
  if (latest && semver.valid(latest)) candidates.push({ version: latest, channel: "latest" });
  if (next && semver.valid(next) && semver.prerelease(a)) candidates.push({ version: next, channel: "next" });
  return candidates.filter((c) => semver.gt(c.version, a)).sort((x, y) => semver.rcompare(x.version, y.version))[0] ?? null;
}

/**
 * "ccl-caut 1.0.1 is available · npm i -g ccl-caut", or null when there is
 * nothing to say. Beta users (a prerelease `current`) are compared against both
 * dist-tags and pointed at the higher one; stable users only ever see `latest`.
 * Never suggests a downgrade.
 */
export function selfUpdateNotice(current: string, latest: string | null, context: InstallContext | null, next: string | null = null): string | null {
  if (!context) return null;
  const best = selfUpdateTarget(current, latest, next);
  const command = best && (best.channel === "latest" ? UPGRADE_COMMAND : NEXT_COMMAND)[context];
  return best && command ? `ccl-caut ${best.version} is available · ${command}` : null;
}

/** Off in CI and with CCL_CAUT_NO_UPDATE_CHECK=1. */
export function selfCheckEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return !env.CI && env.CCL_CAUT_NO_UPDATE_CHECK !== "1";
}

/**
 * The newer-ccl-caut notice is shown at most once per run, at the first slot
 * where the latest version is known: under the banner, after the notes, or
 * after the final summary. `latest` is read at each slot and never awaited.
 */
export function createNoticeSlot(
  current: string,
  context: InstallContext | null,
  latest: () => string | null,
  next: () => string | null = () => null,
): { take(): string | null } {
  let shown = false;
  return {
    take() {
      if (shown) return null;
      const notice = selfUpdateNotice(current, latest(), context, next());
      if (notice) shown = true;
      return notice;
    },
  };
}
