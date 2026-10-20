import type { ToolDescriptor, UpdatePlan } from "../types";
import { fetchLatestGithubRelease, GITHUB_CACHE_TTL_MS } from "../utils/github";
import { versionFromCommand } from "./shared";

// antigravity.google/docs/cli/install: install scripts put `agy` in ~/.local/bin
// (POSIX) or %LOCALAPPDATA%/agy/bin (Windows); `agy update` updates it, and it
// also self-updates in the background. Not on npm. Releases are published at
// github.com/google-antigravity/antigravity-cli (tags without "v").
const RELEASES_REPO = "google-antigravity/antigravity-cli";

export const antigravity: ToolDescriptor = {
  id: "antigravity",
  group: "agents",
  name: "Antigravity CLI",
  shortName: "Antigravity",
  description: "Google's Antigravity CLI (agy), Gemini CLI's successor",
  docsUrl: "https://antigravity.google/docs/cli/install",
  binNames: ["agy"],
  // winget allowlist: per-user upgrade 1.3.6 -> 1.4.0 passed silently (Windows runner, winget 1.11).
  winget: { id: "Google.AntigravityCLI", auto: true },
  refineInstallMethod: (method) => (method === "unknown" ? "native" : method),
  getInstalledVersion: (instance) => versionFromCommand(instance.path),
  getLatestVersion: () => fetchLatestGithubRelease(RELEASES_REPO),
  latestCacheTtlMs: GITHUB_CACHE_TTL_MS,
  async getUpdatePlan(instance): Promise<UpdatePlan> {
    switch (instance.installMethod) {
      case "brew":
        return {
          kind: "manual",
          command: "brew upgrade --cask --greedy antigravity-cli",
          reason: "Installed with Homebrew (the cask auto-updates, so brew needs --greedy).",
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