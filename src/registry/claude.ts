import { createNpmPackageTool } from "./npm-package-tool";
import { brewPlan } from "./shared";

// The npm package ships the same native binary as the native installer
// (bin/claude.exe), so npm's "latest" is valid for both install types.
export const claude = createNpmPackageTool({
  id: "claude",
  name: "Claude Code",
  binNames: ["claude"],
  pkg: "@anthropic-ai/claude-code",
  otherPlan: (instance) => {
    switch (instance.installMethod) {
      case "native": // ~/.local/bin: the official self-updater handles it
        return { kind: "auto", command: [instance.path, "update"] };
      case "brew":
        return brewPlan("claude-code", true);
      default:
        return {
          kind: "manual",
          command: "claude update",
          reason: "Install method not recognized; Claude Code's built-in updater is the safest route.",
        };
    }
  },
});
