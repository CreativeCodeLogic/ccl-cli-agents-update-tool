import type { ToolDescriptor } from "../types";
import { getHost, pathFor } from "../utils/host";
import { fetchLatestNpmVersion, getNpmGlobalPaths, readPackageVersionNear } from "../utils/npm";
import { samePath } from "../utils/paths";
import { versionFromCommand } from "./shared";

/** True when the global prefix of the npm on PATH holds its own npm package. */
async function hasPrefixNpm(): Promise<boolean> {
  const host = getHost();
  const paths = await getNpmGlobalPaths();
  return paths !== null && host.fs.exists(pathFor(host.platform).join(paths.root, "npm", "package.json"));
}

/*
 * On Windows, Node's bundled npm.cmd checks the global prefix and runs
 * <prefix>/node_modules/npm when present (i.e. after `npm install -g npm`).
 * In that case the bundled copy is dormant and the prefix copy is what runs.
 */
export const npm: ToolDescriptor = {
  id: "npm",
  group: "dev",
  name: "npm",
  description: "The Node.js package manager",
  docsUrl: "https://docs.npmjs.com/downloading-and-installing-node-js-and-npm",
  binNames: ["npm"],
  npmPackage: "npm",

  async refineInstallMethod(method) {
    return getHost().platform === "win32" && method === "node" && (await hasPrefixNpm()) ? "npm" : method;
  },

  async runsThrough(active, other) {
    const host = getHost();
    const path = pathFor(host.platform);
    const paths = await getNpmGlobalPaths();
    return (
      host.platform === "win32" &&
      paths !== null &&
      host.fs.exists(path.join(path.dirname(active.path), "node.exe")) &&
      samePath(path.dirname(other.path), paths.prefix, host.platform)
    );
  },

  // Ask the binary: shims may delegate to a different npm than the one next to them.
  async getInstalledVersion(instance) {
    return (await versionFromCommand(instance.path)) ?? readPackageVersionNear(instance.path, instance.realPath, "npm");
  },

  getLatestVersion: () => fetchLatestNpmVersion("npm"),

  // Never automatic; the reason depends on where this npm came from.
  async getUpdatePlan(instance) {
    if (instance.installMethod === "brew") {
      return { kind: "manual", command: "brew upgrade node", reason: "npm is bundled with Homebrew's Node." };
    }
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
