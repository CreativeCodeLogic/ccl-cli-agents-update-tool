import { createNpmPackageTool } from "./npm-package-tool";
import { brewPlan } from "./shared";

export const gemini = createNpmPackageTool({
  id: "gemini",
  name: "Gemini CLI",
  binNames: ["gemini"],
  pkg: "@google/gemini-cli",
  otherPlan: (instance) => (instance.installMethod === "brew" ? brewPlan("gemini-cli") : null),
});
