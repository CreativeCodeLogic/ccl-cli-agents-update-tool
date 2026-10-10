import type { InstallMethod, ToolDescriptor, UpdatePlan } from "../types";
import { createLocator, versionFromCommand } from "./shared";

// STUB: presence + installed version only. Latest-version lookup and real
// update plans come in the next iteration.
const locator = createLocator(["kimi"], (method, bin) =>
  method === "unknown" && /[\\/]\.kimi-code[\\/]/i.test(bin) ? "native" : method,
);

const PREVIEW_REASON = "Kimi support is a preview; automatic updates land in a later release.";

const plans: Partial<Record<InstallMethod, UpdatePlan>> = {
  pip: { kind: "manual", command: "uv tool upgrade kimi-cli", reason: PREVIEW_REASON },
  npm: { kind: "manual", command: "npm install -g @moonshot-ai/kimi-code@latest", reason: PREVIEW_REASON },
};

export const kimi: ToolDescriptor = {
  id: "kimi",
  name: "Kimi CLI",
  binNames: ["kimi"],
  getBinaryPath: () => locator.binaryPath(),
  detectInstallMethod: () => locator.installMethod(),
  getInstalledVersion: async () => versionFromCommand(await locator.binaryPath()),
  getLatestVersion: async () => null,
  getUpdatePlan: (method) =>
    plans[method] ?? {
      kind: "manual",
      command: "See https://github.com/MoonshotAI/kimi-cli for update instructions",
      reason: PREVIEW_REASON,
    },
};
