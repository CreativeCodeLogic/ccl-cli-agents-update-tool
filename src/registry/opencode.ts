import type { BinaryInstance, InstallMethod, ToolDescriptor, UpdatePlan } from "../types";
import { getHost } from "../utils/host";
import { fetchLatestNpmVersion, readPackageVersionNear } from "../utils/npm";
import { normalizePath } from "../utils/paths";
import { brewPlan, npmGlobalPlan, versionFromCommand } from "./shared";

// opencode.ai/docs (repo: github.com/anomalyco/opencode). Two release lines:
// v1 = npm opencode-ai (also Homebrew tap anomalyco/tap/opencode, Chocolatey,
// Scoop), v2 = npm @opencode/cli (Homebrew core `opencode` currently ships v2).
// The install script uses ~/.opencode/bin; `opencode upgrade` is documented.
const V1_PKG = "opencode-ai";
const V2_PKG = "@opencode/cli";

const isV2 = (version: string | null | undefined) => Number.parseInt(version ?? "", 10) >= 2;

function npmPackageOf(instance: BinaryInstance): string {
  return normalizePath(instance.realPath, getHost().platform).includes("/@opencode/cli/") ? V2_PKG : V1_PKG;
}

export const opencode: ToolDescriptor = {
  id: "opencode",
  group: "agents",
  name: "OpenCode",
  description: "Open-source AI coding agent for the terminal",
  docsUrl: "https://opencode.ai/docs",
  binNames: ["opencode"],
  // winget allowlist: per-user upgrade 1.19.0 -> 1.19.1 passed silently (Windows runner, winget 1.11).
  winget: { id: "SST.opencode", auto: true },
  npmPackage: V1_PKG,

  async getInstalledVersion(instance) {
    if (instance.installMethod === "npm") {
      for (const pkg of [V1_PKG, V2_PKG]) {
        const version = await readPackageVersionNear(instance.path, instance.realPath, pkg);
        if (version) return version;
      }
    }
    return versionFromCommand(instance.path);
  },

  // Compare v2 installs against the v2 line, everything else against v1.
  latestChannel: (_method?: InstallMethod, installed?: string | null) => (isV2(installed) ? "v2" : "v1"),
  getLatestVersion: (_method?: InstallMethod, installed?: string | null) => fetchLatestNpmVersion(isV2(installed) ? V2_PKG : V1_PKG),

  async getUpdatePlan(instance): Promise<UpdatePlan> {
    const npmPlan = await npmGlobalPlan(instance, npmPackageOf(instance));
    if (npmPlan) return npmPlan;
    switch (instance.installMethod) {
      case "native":
        return { kind: "auto", command: [instance.path, "upgrade"] };
      case "brew":
        return brewPlan("opencode");
      case "choco":
        return {
          kind: "manual",
          command: "choco upgrade opencode -y",
          reason: "Installed with Chocolatey (needs an elevated terminal).",
          needsAdmin: true,
        };
      case "scoop":
        return { kind: "manual", command: "scoop update opencode", reason: "Installed with Scoop; let Scoop manage the upgrade." };
      default:
        return {
          kind: "manual",
          command: "opencode upgrade",
          reason: "Install method not recognized; the built-in updater is the safest route.",
        };
    }
  },
};