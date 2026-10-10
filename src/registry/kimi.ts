import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BinaryInstance, InstallMethod, ToolDescriptor, UpdatePlan } from "../types";
import { fetchJson, stringField } from "../utils/http";
import { fetchLatestNpmVersion, readPackageVersionNear } from "../utils/npm";
import { isInside, normalizePath } from "../utils/paths";
import { npmGlobalPlan, versionFromCommand } from "./shared";

/*
 * Two products ship a `kimi` binary:
 * - Kimi Code (current): npm @moonshot-ai/kimi-code, or the native installer
 *   (~/.kimi-code/bin) which self-updates via `kimi upgrade` from a CDN manifest
 *   that tracks the npm version line (cdn.kimi.com/kimi-code/latest.json == npm latest).
 * - Kimi CLI (legacy, archived): PyPI kimi-cli, installed with uv/pipx/pip.
 */
const NPM_PKG = "@moonshot-ai/kimi-code";
const LEGACY_PYPI_PKG = "kimi-cli";

/** Directories where uv keeps tool environments. */
function uvToolDirs(): string[] {
  const home = os.homedir();
  const dirs = [process.env.UV_TOOL_DIR];
  if (process.platform === "win32") dirs.push(process.env.APPDATA && path.join(process.env.APPDATA, "uv", "tools"));
  dirs.push(path.join(process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share"), "uv", "tools"));
  return dirs.filter((d): d is string => Boolean(d));
}

/** uv on Windows copies launchers into ~/.local/bin, which looks "native" by path alone. */
function isLegacyUvInstall(): boolean {
  return uvToolDirs().some((dir) => existsSync(path.join(dir, LEGACY_PYPI_PKG)));
}

function legacyPlan(instance: BinaryInstance): UpdatePlan {
  const p = normalizePath(instance.realPath);
  const command = p.includes("/pipx/")
    ? `pipx upgrade ${LEGACY_PYPI_PKG}`
    : p.includes("/uv/") || isLegacyUvInstall()
      ? `uv tool upgrade ${LEGACY_PYPI_PKG}`
      : `pip install -U ${LEGACY_PYPI_PKG}`;
  return {
    kind: "manual",
    command,
    reason: `Legacy Python Kimi CLI (archived). Consider Kimi Code: npm install -g ${NPM_PKG}, then kimi migrate.`,
  };
}

export const kimi: ToolDescriptor = {
  id: "kimi",
  name: "Kimi Code",
  binNames: ["kimi"],
  npmPackage: NPM_PKG,

  refineInstallMethod(method, instance) {
    const userBin = path.join(os.homedir(), ".local", "bin");
    if (method === "native" && process.platform === "win32" && isInside(instance.path, userBin)) {
      return isLegacyUvInstall() ? "pip" : method;
    }
    return method;
  },

  async getInstalledVersion(instance) {
    if (instance.installMethod === "npm") {
      const fromPkg = await readPackageVersionNear(instance.path, instance.realPath, NPM_PKG);
      if (fromPkg) return fromPkg;
    }
    return versionFromCommand(instance.path);
  },

  async getLatestVersion(method?: InstallMethod) {
    if (method === "pip") {
      const pypi = await fetchJson(`https://pypi.org/pypi/${LEGACY_PYPI_PKG}/json`);
      return stringField((pypi as { info?: unknown } | null)?.info, "version");
    }
    return fetchLatestNpmVersion(NPM_PKG);
  },

  async getUpdatePlan(instance) {
    const npmPlan = await npmGlobalPlan(instance, NPM_PKG);
    if (npmPlan) return npmPlan;
    switch (instance.installMethod) {
      case "native": // documented self-updater: `kimi upgrade|update`
        return { kind: "auto", command: [instance.path, "upgrade"] };
      case "pip":
        return legacyPlan(instance);
      default:
        return {
          kind: "manual",
          command: "kimi upgrade",
          reason: "Install method not recognized; the built-in updater is the safest route.",
        };
    }
  },
};
