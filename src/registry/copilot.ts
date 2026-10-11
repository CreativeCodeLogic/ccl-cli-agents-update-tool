import type { BinaryInstance } from "../types";
import { getHost } from "../utils/host";
import { normalizePath } from "../utils/paths";
import { createNpmPackageTool } from "./npm-package-tool";
import { brewPlan } from "./shared";

// docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli
// and the CLI command reference (`copilot update`). npm and GitHub releases share
// one version line. The CLI also auto-updates itself by default.
/**
 * VS Code's Copilot Chat extension (also in Insiders, VSCodium, Cursor) puts a
 * `copilot` launcher on PATH from its extension storage. It forwards to the
 * real CLI elsewhere on PATH and otherwise *prompts to install it*, so it is
 * not an install: never version-check or update through it.
 */
export function isCopilotCli(instance: Pick<BinaryInstance, "path" | "realPath">): boolean {
  return !normalizePath(instance.realPath, getHost().platform).split("/").includes("github.copilot-chat");
}

const tool = createNpmPackageTool({
  id: "copilot",
  group: "agents",
  name: "GitHub Copilot CLI",
  shortName: "Copilot",
  description: "GitHub Copilot's coding agent for the terminal",
  docsUrl: "https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli",
  binNames: ["copilot"],
  pkg: "@github/copilot",
  // The install script uses ~/.local/bin, or /usr/local/bin when run as root.
  refineInstallMethod: (method) => (method === "unknown" ? "native" : method),
  otherPlan: (instance) => {
    switch (instance.installMethod) {
      case "native":
        return { kind: "auto", command: [instance.path, "update"] };
      case "brew":
        return brewPlan("copilot-cli", true);
      case "winget":
        return {
          kind: "manual",
          command: "winget upgrade --id GitHub.Copilot",
          reason: "Installed with winget; let winget manage the upgrade.",
        };
      default:
        return null;
    }
  },
});

export const copilot = { ...tool, identify: isCopilotCli };
