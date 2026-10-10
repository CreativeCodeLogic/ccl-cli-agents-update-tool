import { createNpmPackageTool } from "./npm-package-tool";
import { looksLikeUserLocalBin } from "./shared";

export const claude = createNpmPackageTool({
  id: "claude",
  name: "Claude Code",
  binNames: ["claude"],
  pkg: "@anthropic-ai/claude-code",
  // The native installer drops the binary in ~/.local/bin (all platforms).
  refineMethod: (method, bin) => (method === "unknown" && looksLikeUserLocalBin(bin) ? "native" : method),
  manualPlans: {
    native: {
      kind: "manual",
      command: "claude update",
      reason: "Installed with the native installer, which manages its own updates.",
    },
    brew: {
      kind: "manual",
      command: "brew upgrade --cask claude-code",
      reason: "Installed with Homebrew; let brew manage the upgrade.",
    },
    unknown: {
      kind: "manual",
      command: "claude update",
      reason: "Install method not recognized; Claude Code's built-in updater is the safest route.",
    },
  },
});
