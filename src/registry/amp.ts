import type { BinaryInstance, ToolDescriptor, UpdatePlan } from "../types";
import { envVar, getHost, pathFor, type Host } from "../utils/host";
import { fetchLatestNpmVersion, readPackageVersionNear } from "../utils/npm";
import { isInside } from "../utils/paths";
import { fromBrewToken, ownedByNpmPackage } from "./detect-helpers";
import { npmGlobalPlan, npmInstallPlan, versionFromCommand } from "./shared";
import { linkOnly } from "../whatsnew/sources";

/*
 * ampcode.com/docs/cli: install script (recommended) puts the binary in
 * $AMP_HOME/bin (default ~/.amp/bin) with a ~/.local/bin symlink on POSIX;
 * install.ps1 uses %USERPROFILE%\.amp\bin on Windows. Also Homebrew
 * (ampcode/tap/ampcode) and npm @ampcode/cli. Amp updates itself in the
 * background and `amp update` updates now. The old npm name @sourcegraph/amp
 * is still published as an alias of @ampcode/cli ("Renamed to @ampcode/cli").
 *
 * `amp` is also a terminal text editor (amp.rs, cargo or `brew install amp`)
 * that has no --version flag and opens full screen: Amp is identified by
 * location only and is never run unless found where Amp installs itself.
 * Versions look like 0.0.1791734437-g42649e (the same on npm).
 */
const PKG = "@ampcode/cli";
const OLD_PKG = "@sourcegraph/amp";

function ampBin(host: Host): string {
  const path = pathFor(host.platform);
  return path.join(envVar(host, "AMP_HOME") ?? path.join(host.homedir, ".amp"), "bin");
}

/** Amp, not the amp.rs editor: the install-script folder, the ampcode formula, or the npm packages. */
export function isAmpcode(instance: Pick<BinaryInstance, "path" | "realPath">, host: Host = getHost()): boolean {
  const bin = ampBin(host);
  return (
    isInside(instance.realPath, bin, host.platform) ||
    isInside(instance.path, bin, host.platform) ||
    fromBrewToken(instance, "ampcode", host) ||
    ownedByNpmPackage(instance, [OLD_PKG, PKG], host) !== null
  );
}

const isOldPackage = (instance: BinaryInstance) => ownedByNpmPackage(instance, [OLD_PKG], getHost()) === OLD_PKG;
const MIGRATE = `npm uninstall -g ${OLD_PKG} && npm install -g ${PKG}`;

export const amp: ToolDescriptor = {
  id: "amp",
  group: "agents",
  name: "Amp",
  description: "Amp's coding agent for the terminal (ampcode.com)",
  docsUrl: "https://ampcode.com/docs/cli",
  releaseNotes: linkOnly("https://ampcode.com/news"),
  binNames: ["amp"],
  npmPackage: PKG,
  projectPackages: [PKG, OLD_PKG],
  identify: (instance) => isAmpcode(instance),

  instanceNotes: (instance) =>
    isOldPackage(instance)
      ? [
          {
            kind: "info",
            message: `Installed from the old npm name ${OLD_PKG}, now an alias of ${PKG}. Switch to the install script or ${PKG}: ${MIGRATE}`,
            url: "https://ampcode.com/news/npm-package-changes",
          },
        ]
      : [],

  async getInstalledVersion(instance) {
    if (instance.installMethod === "npm") {
      const fromPkg = await readPackageVersionNear(instance.path, instance.realPath, PKG);
      if (fromPkg) return fromPkg;
    }
    return (await versionFromCommand(instance.path, ["--version"])) ?? versionFromCommand(instance.path, ["version"]);
  },

  getLatestVersion: () => fetchLatestNpmVersion(PKG),

  async getUpdatePlan(instance): Promise<UpdatePlan> {
    if (isOldPackage(instance)) {
      // npm 12: the new package's install script puts the native binary in place (--allow-scripts).
      const install = await npmInstallPlan(PKG, "latest");
      const command = install.kind === "auto" ? `npm uninstall -g ${OLD_PKG} && ${install.command.join(" ")}` : `npm uninstall -g ${OLD_PKG} && ${install.command}`;
      const reason = `${OLD_PKG} was renamed to ${PKG}; reinstall under the new name.${install.kind === "manual" ? ` ${install.reason}` : ""}`;
      return { kind: "manual", command, reason };
    }
    const npm = await npmGlobalPlan(instance, PKG);
    if (npm) return npm;
    if (instance.installMethod === "brew") {
      return { kind: "manual", command: "brew upgrade ampcode", reason: "Installed with Homebrew (ampcode/tap); let brew manage the upgrade." };
    }
    if (isInside(instance.realPath, ampBin(getHost()), getHost().platform) || isInside(instance.path, ampBin(getHost()), getHost().platform)) {
      return { kind: "auto", command: [instance.path, "update"] }; // documented self-updater
    }
    return { kind: "manual", command: "amp update", reason: "Install method not recognized; Amp's own updater is the safest route." };
  },
};