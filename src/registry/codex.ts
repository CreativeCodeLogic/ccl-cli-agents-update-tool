import { createNpmPackageTool } from "./npm-package-tool";

export const codex = createNpmPackageTool({
  id: "codex",
  name: "Codex CLI",
  binNames: ["codex"],
  pkg: "@openai/codex",
  manualPlans: {
    brew: {
      kind: "manual",
      command: "brew upgrade --cask codex",
      reason: "Installed with Homebrew; let brew manage the upgrade.",
    },
  },
});
