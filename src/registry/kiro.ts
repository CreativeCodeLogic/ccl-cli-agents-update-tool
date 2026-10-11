import type { ToolDescriptor, UpdatePlan } from "../types";
import { getHost } from "../utils/host";
import { fetchJson, stringField } from "../utils/http";
import { normalizePath } from "../utils/paths";
import { linuxPackageManager } from "./detect-helpers";
import { versionFromCommand } from "./shared";

/*
 * kiro.dev/docs/cli/installation/: `curl -fsSL https://cli.kiro.dev/install | bash`
 * (macOS: /Applications/Kiro CLI.app; Linux: ~/.local/bin/kiro-cli), Windows 11:
 * install.ps1 runs an MSI into C:\Program Files\Kiro-Cli; Homebrew cask kiro-cli
 * (auto_updates, so `brew upgrade --greedy`); Amazon Linux dnf repo. It
 * auto-updates in the background and `kiro-cli update --non-interactive`
 * updates now. The stable channel publishes its version in a public manifest.
 */
const MANIFEST = "https://prod.download.cli.kiro.dev/stable/latest/manifest.json";

/** The installer's own locations (not a package manager). */
function isInstallerCopy(realPath: string): boolean {
  const p = normalizePath(realPath, getHost().platform);
  return p.includes("/kiro cli.app/") || p.includes("/kiro-cli/") || p.endsWith("/.local/bin/kiro-cli");
}

export const kiro: ToolDescriptor = {
  id: "kiro",
  group: "agents",
  name: "Kiro CLI",
  shortName: "Kiro",
  description: "AWS Kiro's agent for the terminal (formerly Amazon Q CLI)",
  docsUrl: "https://kiro.dev/docs/cli/installation/",
  binNames: ["kiro-cli"],

  refineInstallMethod: (method, instance) => (method !== "brew" && isInstallerCopy(instance.realPath) ? "native" : method === "unknown" ? "native" : method),
  getInstalledVersion: (instance) => versionFromCommand(instance.path),
  getLatestVersion: async () => stringField(await fetchJson(MANIFEST), "version"),

  async getUpdatePlan(instance): Promise<UpdatePlan> {
    switch (instance.installMethod) {
      case "brew":
        return { kind: "manual", command: "brew upgrade --greedy kiro-cli", reason: "Homebrew cask that updates itself; brew only upgrades it with --greedy." };
      case "apt":
        return linuxPackageManager() === "dnf"
          ? { kind: "manual", command: "sudo dnf upgrade kiro-cli", reason: "Installed from the Kiro dnf repository; `kiro-cli update` only reports new versions there." }
          : { kind: "manual", command: "kiro-cli update", reason: "Installed from a Linux package; if it can't update itself, install the new package from kiro.dev." };
      default:
        return { kind: "auto", command: [instance.path, "update", "--non-interactive"] }; // documented self-updater
    }
  },
};