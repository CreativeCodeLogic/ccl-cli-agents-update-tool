import { createNpmPackageTool } from "./npm-package-tool";
import { brewPlan } from "./shared";
import { githubRelease } from "../whatsnew/sources";

export const codex = createNpmPackageTool({
  id: "codex",
  group: "agents",
  name: "Codex CLI",
  shortName: "Codex",
  description: "OpenAI's coding agent for the terminal",
  docsUrl: "https://developers.openai.com/codex/cli",
  releaseNotes: githubRelease("openai/codex", (v) => `rust-v${v}`),
  binNames: ["codex"],
  pkg: "@openai/codex",
  otherPlan: (instance) => {
    if (instance.installMethod === "brew") return brewPlan("codex", true);
    if (instance.installMethod === "native") {
      return {
        kind: "manual",
        command: "Download the latest binary from https://github.com/openai/codex/releases/latest",
        reason: "Standalone Codex binary; replace it with the new release.",
      };
    }
    return null;
  },
});
