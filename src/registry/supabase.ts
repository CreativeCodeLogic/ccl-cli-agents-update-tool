import type { ToolDescriptor, UpdatePlan } from "../types";
import { fetchLatestGithubRelease } from "../utils/github";
import { versionFromCommand } from "./shared";

/*
 * supabase.com/docs/guides/local-development/cli/getting-started: Homebrew
 * (supabase/tap/supabase, or the homebrew-core `supabase` formula), Scoop
 * (supabase bucket), Linux .deb/.rpm/.apk from GitHub releases, an install
 * script, and npm only as a project dev dependency (`npm i -D supabase`).
 * Releases: github.com/supabase/cli (tags vX.Y.Z). No self-update command, so
 * every plan is a command to copy.
 */
const SCRIPT = "curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install | bash";

export const supabase: ToolDescriptor = {
  id: "supabase",
  group: "dev",
  name: "Supabase CLI",
  shortName: "Supabase",
  description: "Supabase's CLI for local development and project management",
  docsUrl: "https://supabase.com/docs/guides/local-development/cli/getting-started",
  binNames: ["supabase"],
  // npm is for projects only: the project-copy check looks for "supabase".
  projectPackages: ["supabase"],

  getInstalledVersion: (instance) => versionFromCommand(instance.path),
  getLatestVersion: () => fetchLatestGithubRelease("supabase/cli"),

  async getUpdatePlan(instance): Promise<UpdatePlan> {
    switch (instance.installMethod) {
      case "brew":
        return { kind: "manual", command: "brew upgrade supabase", reason: "Installed with Homebrew (supabase/tap or homebrew-core); let brew manage the upgrade." };
      case "scoop":
        return { kind: "manual", command: "scoop update supabase", reason: "Installed with Scoop; let Scoop manage the upgrade." };
      case "npm":
        return {
          kind: "manual",
          command: "npm install -g supabase@latest",
          reason: "Supabase supports npm only as a project dev dependency (npm i -D supabase); for a global CLI use Homebrew, Scoop or a Linux package.",
        };
      case "apt":
        return {
          kind: "manual",
          command: SCRIPT,
          reason: "Installed from a Linux package: install the new .deb/.rpm/.apk from github.com/supabase/cli/releases, or use the official install script.",
        };
      default:
        return { kind: "manual", command: SCRIPT, reason: "No self-update command; re-run the official install script (or use your package manager)." };
    }
  },
};