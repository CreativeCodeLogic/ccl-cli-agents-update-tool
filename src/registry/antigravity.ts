import type { ToolDescriptor, UpdatePlan } from "../types";
import { fetchJson, stringField } from "../utils/http";
import { versionFromCommand } from "./shared";

// antigravity.google/docs/cli/install: install scripts put `agy` in ~/.local/bin
// (POSIX) or %LOCALAPPDATA%/agy/bin (Windows); `agy update` updates it, and it
// also self-updates in the background. Not on npm. Releases are published at
// github.com/google-antigravity/antigravity-cli (tags without "v").
const RELEASES_URL = "https://api.github.com/repos/google-antigravity/antigravity-cli/releases/latest";

export const antigravity: ToolDescriptor = {
  id: "antigravity",
  name: "Antigravity CLI",
  shortName: "Antigravity",
  binNames: ["agy"],
  refineInstallMethod: (method) => (method === "unknown" ? "native" : method),
  getInstalledVersion: (instance) => versionFromCommand(instance.path),
  async getLatestVersion() {
    const tag = stringField(await fetchJson(RELEASES_URL), "tag_name");
    return tag ? tag.replace(/^v/, "") : null;
  },
  async getUpdatePlan(instance): Promise<UpdatePlan> {
    switch (instance.installMethod) {
      case "brew":
        return {
          kind: "manual",
          command: "brew upgrade --cask --greedy antigravity-cli",
          reason: "Installed with Homebrew (the cask auto-updates, so brew needs --greedy).",
        };
      case "winget":
        return {
          kind: "manual",
          command: "winget upgrade --id Google.AntigravityCLI",
          reason: "Installed with winget; let winget manage the upgrade.",
        };
      case "native":
        return { kind: "auto", command: [instance.path, "update"] };
      default:
        return {
          kind: "manual",
          command: "agy update",
          reason: "Install method not recognized; the built-in updater is the safest route.",
        };
    }
  },
};