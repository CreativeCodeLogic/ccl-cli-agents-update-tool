import type { BinaryInstance, InstallMethod, ToolDescriptor, UpdatePlan } from "../types";
import { getHost, pathFor, type Host } from "../utils/host";
import { fetchLatestNpmVersion, readPackageVersionNear } from "../utils/npm";
import { isInside } from "../utils/paths";
import { fetchLatestPypiVersion } from "../utils/pypi";
import { distInfoVersion, pythonUpdatePlan } from "../utils/python";
import { pythonInstallOf } from "./python-package-tool";
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

const PYTHON_METHODS: readonly InstallMethod[] = ["uv", "pipx", "pip"];
const isPython = (method: InstallMethod | undefined) => method !== undefined && PYTHON_METHODS.includes(method);

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

/**
 * The archived Python Kimi CLI stays a command to copy (nudging towards Kimi
 * Code), with the upgrade command of the manager that installed it.
 */
function legacyPlan(instance: BinaryInstance): UpdatePlan {
  const install = pythonInstallOf(instance, LEGACY_PYPI_PKG);
  const kind = install?.kind ?? (instance.installMethod === "uv" || instance.installMethod === "pipx" ? instance.installMethod : "pip");
  const plan = pythonUpdatePlan(install ?? { kind, sitePackages: "", venv: null, userSite: false }, LEGACY_PYPI_PKG, true);
  return {
    kind: "manual",
    command: plan.kind === "auto" ? plan.command.join(" ") : plan.command,
    reason: `Legacy Python Kimi CLI (archived). Consider Kimi Code: npm install -g ${NPM_PKG}, then kimi migrate.`,
  };
}

export const kimi: ToolDescriptor = {
  id: "kimi",
  group: "agents",
  name: "Kimi Code",
  shortName: "Kimi",
  description: "Moonshot AI's Kimi Code agent for the terminal",
  docsUrl: "https://moonshotai.github.io/kimi-code/",
  binNames: ["kimi"],
  npmPackage: NPM_PKG,

  refineInstallMethod(method, instance) {
    if (isPython(method)) return pythonInstallOf(instance, LEGACY_PYPI_PKG)?.kind ?? method;
    // uv's Windows launchers (and pipx/uv shims) sit in ~/.local/bin, which looks native by path alone.
    const host = getHost();
    const userBin = pathFor(host.platform).join(host.homedir, ".local", "bin");
    if (method === "native" && isInside(instance.path, userBin, host.platform)) {
      return pythonInstallOf(instance, LEGACY_PYPI_PKG)?.kind ?? method;
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
    if (isPython(instance.installMethod)) {
      const install = pythonInstallOf(instance, LEGACY_PYPI_PKG);
      const fromMetadata = install && distInfoVersion(install.sitePackages, LEGACY_PYPI_PKG, getHost());
      if (fromMetadata) return fromMetadata;
    }
    return versionFromCommand(instance.path);
  },

  latestChannel: (method) => (isPython(method) ? "pypi" : "npm"),

  async getLatestVersion(method?: InstallMethod) {
    return isPython(method) ? fetchLatestPypiVersion(LEGACY_PYPI_PKG) : fetchLatestNpmVersion(NPM_PKG);
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
      case "uv":
      case "pipx":
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

  // A staged rollout explains an unchanged version only if the updater didn't say it can't update.
  explainUnchanged: (instance, output) =>
    instance.installMethod === "native" && !/not supported|update manually/i.test(output)
      ? {
          status: "held",
          message: "Kimi Code: update held by staged rollout (releases roll out over ~24h). Try again later.",
        }
      : null,
};
