import { createNpmPackageTool } from "./npm-package-tool";
import { brewPlan } from "./shared";

export const gemini = createNpmPackageTool({
  id: "gemini",
  name: "Gemini CLI",
  shortName: "Gemini",
  binNames: ["gemini"],
  pkg: "@google/gemini-cli",
  // https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/
  deprecation: {
    message:
      "retired for consumer accounts since Jun 2026 -> use Antigravity CLI (agy). Still works with enterprise licenses / paid API keys.",
    successorId: "antigravity",
    since: "2026-06-18",
    url: "https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/",
  },
  otherPlan: (instance) => (instance.installMethod === "brew" ? brewPlan("gemini-cli") : null),
});