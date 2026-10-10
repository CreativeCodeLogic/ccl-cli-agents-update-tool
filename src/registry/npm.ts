import type { ToolDescriptor } from "../types";
import { fetchLatestNpmVersion } from "../utils/npm";
import { createLocator, versionFromCommand } from "./shared";

// npm bundled with the Node.js installer lives outside the global root;
// report it as "native" (shipped with Node) rather than "unknown".
const locator = createLocator(["npm"], (method) => (method === "unknown" ? "native" : method));

export const npm: ToolDescriptor = {
  id: "npm",
  name: "npm",
  binNames: ["npm"],
  getBinaryPath: () => locator.binaryPath(),
  detectInstallMethod: () => locator.installMethod(),
  // Ask the npm on PATH: that is the one the user actually runs.
  getInstalledVersion: async () => versionFromCommand(await locator.binaryPath()),
  getLatestVersion: () => fetchLatestNpmVersion("npm"),
  getUpdatePlan: () => ({
    kind: "manual",
    command: "npm install -g npm@latest",
    reason: "Version managers (nvm, volta, fnm) pin npm per Node version; a global self-update can break them.",
  }),
};
