import { fromBrewToken, ownedByNpmPackage } from "./detect-helpers";
import { createNpmPackageTool } from "./npm-package-tool";
import { brewPlan } from "./shared";

// docs.cline.bot/usage/cli-overview: `npm install -g cline` (bin cline, native
// platform packages @cline/cli-*). `cline update` exists; npm updates a global
// install the same way. Homebrew's community `cline` formula lags behind.
export const cline = createNpmPackageTool({
  id: "cline",
  group: "agents",
  name: "Cline CLI",
  shortName: "Cline",
  binNames: ["cline"],
  pkg: "cline",
  description: "Cline's coding agent for the terminal",
  docsUrl: "https://docs.cline.bot/usage/cli-overview",
  // "cline" is not unique enough to claim any binary by name.
  identify: (instance) => ownedByNpmPackage(instance, ["cline"]) !== null || fromBrewToken(instance, "cline"),
  otherPlan: (instance) => (instance.installMethod === "brew" ? brewPlan("cline") : null),
});