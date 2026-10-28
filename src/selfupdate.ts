import type { BinaryInstance, ToolDescriptor, ToolScan, UpdatePlan } from "./types";
import { versionFromCommand } from "./registry/shared";
import { computeNeedsAdmin } from "./scan";
import { getHost, type Host } from "./utils/host";
import { isVoltaPath } from "./utils/installMethod";
import { getNpmGlobalPaths, isInCurrentNpmGlobal } from "./utils/npm";
import { findAllExecutables } from "./utils/which";
import type { InstallContext } from "./self";
import { SELF_NOTES } from "./whatsnew/sources";

/*
 * CCL CAUT itself as a checklist row ("CCL CAUT", first). Only for a global
 * npm install: npx runs fetch the newest version on their own (the notice says
 * so), source checkouts update with git, project installs with the project.
 * It always runs last, and is verified with `ccl-caut --version` from PATH:
 * the code running now is the old version.
 */

export const SELF_ID = "ccl-caut";
export const SELF_NAME = "CCL CAUT";
const PKG = "ccl-caut";

/** The plan for moving a global install to exactly `version`. */
export async function selfUpdatePlan(instance: BinaryInstance, version: string, host: Host = getHost()): Promise<UpdatePlan> {
  const command = `npm install -g ${PKG}@${version}`;
  if (await isInCurrentNpmGlobal(instance.path, instance.realPath, host)) return { kind: "auto", command: command.split(" ") };
  if (isVoltaPath(instance.path, host)) {
    return { kind: "manual", command: `volta install ${PKG}@${version}`, reason: "Managed by Volta; let Volta install the new version." };
  }
  return {
    kind: "manual",
    command,
    reason: "Installed under a different Node.js/npm prefix (version manager?); run this with that Node version active.",
  };
}

/** Re-checks the version with the `ccl-caut` on PATH (a new process: the new code). */
export const selfTool: ToolDescriptor = {
  id: SELF_ID,
  name: SELF_NAME,
  group: "self",
  binNames: [PKG],
  description: "This tool",
  docsUrl: "https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool",
  releaseNotes: SELF_NOTES,
  npmPackage: PKG,
  getInstalledVersion: () => versionFromCommand(PKG),
  getLatestVersion: async () => null,
  getUpdatePlan: async () => ({ kind: "manual", command: `npm install -g ${PKG}@latest`, reason: "" }),
};

/**
 * The checklist row and its update target, or null (no newer version, not a
 * global install, or ccl-caut can't be found).
 */
export async function selfUpdateRow(options: {
  current: string;
  target: string | null;
  context: InstallContext | null;
  /** Real path of the running entry script. */
  entryPath: string;
  host?: Host;
}): Promise<{ scan: ToolScan; instance: BinaryInstance } | null> {
  const { current, target, context, entryPath } = options;
  const host = options.host ?? getHost();
  if (!target || context !== "global") return null;
  // The shim on PATH (what the user runs), backed by the running package.
  const binPath = findAllExecutables([PKG], host)[0] ?? entryPath;
  const instance: BinaryInstance = { path: binPath, realPath: entryPath, installMethod: "npm" };
  const plan = await selfUpdatePlan(instance, target, host);
  const npmRoot = (await getNpmGlobalPaths())?.root ?? null;
  const scan: ToolScan = {
    id: SELF_ID,
    name: SELF_NAME,
    shortName: SELF_NAME,
    group: "self",
    docsUrl: selfTool.docsUrl,
    installed: true,
    installMethod: "npm",
    binaryPath: binPath,
    installedVersion: current,
    latestVersion: target,
    latestStaleCachedAt: null,
    state: "outdated",
    updateAvailable: true,
    needsAdmin: computeNeedsAdmin(selfTool, instance, plan, host, npmRoot),
    plan,
    shadowed: [],
    deprecation: null,
    notes: [],
    projectPin: null,
    compatibility: null,
    waitingFor: null, broken: null,
  };
  return { scan, instance };
}

/** Self-update runs after every other update (it replaces the code that is running). */
export function selfLast<T extends { scan: { id: string } }>(targets: readonly T[]): T[] {
  return [...targets.filter((t) => t.scan.id !== SELF_ID), ...targets.filter((t) => t.scan.id === SELF_ID)];
}

/** npm couldn't replace the files (Windows: another ccl-caut, an editor or a virus scanner holds them). */
export function selfUpdateFailureHint(output: string, version: string): string | null {
  if (!/EBUSY|EPERM|resource busy|operation not permitted|being used by another process/i.test(output)) return null;
  return `npm couldn't replace CCL CAUT's files (they are in use: another ccl-caut window, an editor or a virus scanner). Close them and run: npm install -g ${PKG}@${version}`;
}