import type { ToolDescriptor } from "../types";
import { versionFromCommand } from "./shared";

// STUB: presence + installed version only. Latest lookup and update plans come next.
export const kimi: ToolDescriptor = {
  id: "kimi",
  name: "Kimi CLI",
  binNames: ["kimi"],
  getInstalledVersion: (instance) => versionFromCommand(instance.path),
  getLatestVersion: async () => null,
  getUpdatePlan: async () => ({
    kind: "manual",
    command: "See https://github.com/MoonshotAI/kimi-cli for update instructions",
    reason: "Kimi support is a preview; automatic updates land in a later release.",
  }),
};
