import { existsSync } from "node:fs";
import path from "node:path";
import type { ToolDescriptor } from "../types";
import { fetchLatestNpmVersion, getNpmGlobalPaths, readPackageVersionNear } from "../utils/npm";
import { samePath } from "../utils/paths";
import { versionFromCommand } from "./shared";

/** Path of the npm package installed in the global prefix of the npm on PATH, if any. */
async function prefixNpmDir(): Promise<string | null> {
  const paths = await getNpmGlobalPaths();
  const dir = paths && path.join(paths.root, "npm");
  return dir && existsSync(path.join(dir, "package.json")) ? dir : null;
}

/*
 * On Windows, Node's bundled npm.cmd checks the global prefix and runs
 * <prefix>/node_modules/npm when present (i.e. after `npm install -g npm`).
 * In that case the bundled copy is dormant and the prefix copy is what runs.
 */
const isWindows = process.platform === "win32";

export const npm: ToolDescriptor = {
  id: "npm",
  name: "npm",
  binNames: ["npm"],
  npmPackage: "npm",

  async refineInstallMethod(method) {
    return isWindows && method === "node" && (await prefixNpmDir()) ? "npm" : method;
  },

  async runsThrough(active, other) {
    const paths = await getNpmGlobalPaths();
    return (
      isWindows &&
      paths !== null &&
      existsSync(path.join(path.dirname(active.path), "node.exe")) &&
      samePath(path.dirname(other.path), paths.prefix)
    );
  },

  // Ask the binary: shims may delegate to a different npm than the one next to them.
  async getInstalledVersion(instance) {
    return (await versionFromCommand(instance.path)) ?? readPackageVersionNear(instance.path, instance.realPath, "npm");
  },

  getLatestVersion: () => fetchLatestNpmVersion("npm"),

  // Never automatic; the reason depends on where this npm came from.
  async getUpdatePlan(instance) {
    return {
      kind: "manual",
      command: "npm install -g npm@latest",
      reason:
        instance.installMethod === "node"
          ? "Bundled with Node.js; upgrading Node (or switching versions in your version manager) is the safe way to get a newer npm."
          : "Version managers (nvm, volta, fnm) pin npm per Node version; a global self-update can break them.",
    };
  },
};
