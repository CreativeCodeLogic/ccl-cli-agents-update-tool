import type { BinaryInstance, InstallMethod, ToolDescriptor, UpdatePlan } from "../types";
import { envVar, getHost, pathFor, type Host } from "../utils/host";
import { fetchJson, stringField } from "../utils/http";
import { fetchLatestNpmVersion, readPackageVersionNear } from "../utils/npm";
import { isInside, normalizePath } from "../utils/paths";
import { extractVersion } from "../utils/version";
import { npmGlobalPlan, versionFromCommand } from "./shared";

/*
 * Two products ship a `kimi` binary:
 * - Kimi Code (current): npm @moonshot-ai/kimi-code, or the native installer
 *   (~/.kimi-code/bin) which self-updates via `kimi upgrade` from a CDN manifest
 *   that tracks the npm version line (cdn.kimi.com/kimi-code/latest.json == npm latest).
 *   Native releases roll out in stages over ~24h.
 * - Kimi CLI (legacy, archived): PyPI kimi-cli, installed with uv/pipx/pip.
 */
const NPM_PKG = "@moonshot-ai/kimi-code";
const LEGACY_PYPI_PKG = "kimi-cli";
const WINDOWS_INSTALLER = "https://code.kimi.com/kimi-code/install.ps1";

/** Directories where uv keeps tool environments. */
export function uvToolDirs(host: Host): string[] {
  const path = pathFor(host.platform);
  const dirs = [envVar(host, "UV_TOOL_DIR")];
  if (host.platform === "win32") {
    const appData = envVar(host, "APPDATA");
    dirs.push(appData && path.join(appData, "uv", "tools"));
  }
  dirs.push(path.join(envVar(host, "XDG_DATA_HOME") ?? path.join(host.homedir, ".local", "share"), "uv", "tools"));
  return dirs.filter((d): d is string => Boolean(d));
}

/** uv on Windows copies launchers into ~/.local/bin, which looks "native" by path alone. */
function isLegacyUvInstall(host: Host): boolean {
  const path = pathFor(host.platform);
  return uvToolDirs(host).some((dir) => host.fs.exists(path.join(dir, LEGACY_PYPI_PKG)));
}

/**
 * Installed version of a native Kimi Code install without spawning it (~1.2s):
 * the self-updater appends JSON lines to <root>/updates/rollout.log, each with
 * the running binary's "current" version. The last entry is only trusted if it
 * was written after the binary was last replaced (otherwise it may predate an
 * upgrade); null means "ask the binary".
 */
export function nativeVersionFromUpdaterLog(instance: BinaryInstance, host: Host = getHost()): string | null {
  const path = pathFor(host.platform);
  const root = path.dirname(path.dirname(instance.realPath)); // <root>/bin/kimi(.exe)
  const log = host.fs.readText(path.join(root, "updates", "rollout.log"));
  const binaryChanged = host.fs.mtimeMs(instance.realPath);
  if (!log || binaryChanged === null) return null;

  const lastLine = log.trimEnd().split("\n").pop();
  try {
    const entry = JSON.parse(lastLine ?? "") as { ts?: unknown; current?: unknown };
    const writtenAt = typeof entry.ts === "string" ? Date.parse(entry.ts) : Number.NaN;
    if (typeof entry.current !== "string" || !(writtenAt >= binaryChanged)) return null;
    return extractVersion(entry.current);
  } catch {
    return null;
  }
}

function legacyPlan(instance: BinaryInstance, host: Host): UpdatePlan {
  const p = normalizePath(instance.realPath, host.platform);
  const command = p.includes("/pipx/")
    ? `pipx upgrade ${LEGACY_PYPI_PKG}`
    : p.includes("/uv/") || isLegacyUvInstall(host)
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
  shortName: "Kimi",
  binNames: ["kimi"],
  npmPackage: NPM_PKG,

  refineInstallMethod(method, instance) {
    const host = getHost();
    const userBin = pathFor(host.platform).join(host.homedir, ".local", "bin");
    if (method === "native" && host.platform === "win32" && isInside(instance.path, userBin, host.platform)) {
      return isLegacyUvInstall(host) ? "pip" : method;
    }
    return method;
  },

  async getInstalledVersion(instance) {
    if (instance.installMethod === "native") {
      const fromLog = nativeVersionFromUpdaterLog(instance);
      if (fromLog) return fromLog;
    }
    if (instance.installMethod === "npm") {
      const fromPkg = await readPackageVersionNear(instance.path, instance.realPath, NPM_PKG);
      if (fromPkg) return fromPkg;
    }
    return versionFromCommand(instance.path);
  },

  latestChannel: (method) => (method === "pip" ? "pypi" : "npm"),

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
      case "native":
        // `kimi upgrade` on Windows only prints "Auto-update is not supported on
        // this platform" (verified with 0.28.1); re-running the official installer
        // upgrades %USERPROFILE%/.kimi-code in place.
        if (getHost().platform === "win32") {
          return {
            kind: "manual",
            command: `irm ${WINDOWS_INSTALLER} | iex`,
            reason: "Kimi Code's built-in updater doesn't support Windows; re-run the official installer in PowerShell.",
          };
        }
        return { kind: "auto", command: [instance.path, "upgrade"] }; // documented self-updater
      case "pip":
        return legacyPlan(instance, getHost());
      default:
        return {
          kind: "manual",
          command: "kimi upgrade",
          reason: "Install method not recognized; the built-in updater is the safest route.",
        };
    }
  },

  // A staged rollout explains an unchanged version only if the updater didn't say it can't update.
  explainUnchanged: (instance, output) =>
    instance.installMethod === "native" && !/not supported|update manually/i.test(output)
      ? {
          status: "held",
          message: "Kimi Code: update held by staged rollout (releases roll out over ~24h). Try again later.",
        }
      : null,
};
