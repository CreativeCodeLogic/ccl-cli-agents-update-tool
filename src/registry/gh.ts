import type { ToolDescriptor, UpdatePlan } from "../types";
import { fetchLatestGithubRelease, GITHUB_CACHE_TTL_MS } from "../utils/github";
import { getHost, pathFor } from "../utils/host";
import { linuxPackageManager } from "./detect-helpers";
import { brewPlan, versionFromCommand } from "./shared";

/*
 * github.com/cli/cli#installation: official winget (GitHub.cli), MSI, Homebrew
 * formula `gh`, apt / dnf / yum / zypper repositories; community Scoop, Chocolatey,
 * Conda, MacPorts. No self-update command. Releases: cli/cli (tags vX.Y.Z).
 * `gh --version` prints "gh version 2.102.0 (2026-09-30)".
 */
const WINGET: UpdatePlan = {
  kind: "manual",
  command: "winget upgrade --id GitHub.cli --source winget",
  reason: "GitHub CLI has no self-update; winget upgrades the MSI install in place (and asks for admin rights itself).",
  needsAdmin: false,
};

export const gh: ToolDescriptor = {
  id: "gh",
  group: "dev",
  name: "GitHub CLI",
  shortName: "gh",
  description: "GitHub's official CLI (gh)",
  docsUrl: "https://github.com/cli/cli#installation",
  binNames: ["gh"],
  // winget allowlist (per-user installs only): upgrade 2.101.0 -> 2.102.0 passed silently
  // (Windows runner, winget 1.11). The MSI in Program Files stays a command (it is "native").
  winget: { id: "GitHub.cli", auto: true },

  getInstalledVersion: (instance) => versionFromCommand(instance.path),
  getLatestVersion: () => fetchLatestGithubRelease("cli/cli"),
  latestCacheTtlMs: GITHUB_CACHE_TTL_MS,

  async getUpdatePlan(instance): Promise<UpdatePlan> {
    switch (instance.installMethod) {
      case "brew":
        return brewPlan("gh");
      case "scoop":
        return { kind: "manual", command: "scoop update gh", reason: "Installed with Scoop (community package); let Scoop manage the upgrade." };
      case "choco":
        return { kind: "manual", command: "choco upgrade gh -y", reason: "Installed with Chocolatey (community package); run from an elevated terminal.", needsAdmin: true };
      case "snap":
        return { kind: "manual", command: "sudo snap refresh gh", reason: "Installed as a snap; snapd refreshes it (this forces it now)." };
      case "apt": {
        const manager = linuxPackageManager();
        const command =
          manager === "dnf" ? "sudo dnf update gh" : manager === "zypper" ? "sudo zypper update gh" : "sudo apt update && sudo apt install --only-upgrade gh";
        return { kind: "manual", command, reason: "Installed from GitHub's Linux package repository; your package manager upgrades it." };
      }
      case "native":
        if (getHost().platform === "win32") return WINGET; // the MSI (also what winget installs) lives in Program Files
        return {
          kind: "manual",
          command: "https://github.com/cli/cli/releases/latest",
          reason: "Installed from a release archive: download the new archive from this page and replace gh, or switch to a package manager.",
        };
      default:
        return {
          kind: "manual",
          command: getHost().platform === "win32" ? WINGET.command : getHost().platform === "darwin" ? "brew upgrade gh" : "sudo apt install --only-upgrade gh",
          reason: "Install method not recognized; update gh with the package manager you installed it with.",
        };
    }
  },

  // Admin rights are judged on the folder gh lives in (Program Files for the MSI).
  updateTargetDir: (instance) => pathFor(getHost().platform).dirname(instance.realPath),
};