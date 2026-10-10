import { createNpmPackageTool } from "./npm-package-tool";

export const gemini = createNpmPackageTool({
  id: "gemini",
  name: "Gemini CLI",
  binNames: ["gemini"],
  pkg: "@google/gemini-cli",
  manualPlans: {
    brew: {
      kind: "manual",
      command: "brew upgrade gemini-cli",
      reason: "Installed with Homebrew; let brew manage the upgrade.",
    },
  },
});
