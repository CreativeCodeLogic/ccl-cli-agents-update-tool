import type { BinaryInstance, ToolDescriptor, UpdatePlan } from "../types";
import { getHost } from "../utils/host";
import { normalizePath } from "../utils/paths";
import { versionFromCommand } from "./shared";

// cursor.com/docs/cli/installation: the installer puts the CLI in
// ~/.local/share/cursor-agent/versions/<ver>/ with ~/.local/bin/{agent,cursor-agent}
// symlinks (POSIX), or %LOCALAPPDATA%/cursor-agent (Windows). Homebrew's
// cursor-cli cask installs only `cursor-agent`. It auto-updates by default and
// `agent update` forces it. There is no public latest-version source (the
// version is only embedded in the install script), so it is "self-updating".

/** Versions look like 2026.10.01-e373342 (sometimes with a time part). */
const CURSOR_VERSION = /^\d{4}\.\d{2}\.\d{2}(?:-\d{2}-\d{2}-\d{2})?-[0-9a-f]{7,}$/;

function segments(instance: Pick<BinaryInstance, "realPath">): string[] {
  return normalizePath(instance.realPath, getHost().platform).split("/");
}

/** `agent` is a generic name: only claim binaries that live in Cursor's install layout. */
export function isCursorAgent(instance: Pick<BinaryInstance, "path" | "realPath">): boolean {
  const parts = segments(instance);
  const file = parts.at(-1)?.replace(/\.(exe|cmd|ps1)$/, "") ?? "";
  return parts.includes("cursor-agent") || parts.includes("cursor-cli") || file === "cursor-agent";
}

/** Version from the versioned install directory, when the path has one. */
export function cursorVersionFromPath(instance: Pick<BinaryInstance, "realPath">): string | null {
  return segments(instance).find((s) => CURSOR_VERSION.test(s)) ?? null;
}

export const cursor: ToolDescriptor = {
  id: "cursor",
  name: "Cursor CLI",
  shortName: "Cursor",
  description: "Cursor's coding agent for the terminal (agent)",
  docsUrl: "https://cursor.com/docs/cli/installation",
  binNames: ["agent", "cursor-agent"],
  selfUpdating: true,
  identify: isCursorAgent,
  refineInstallMethod: (method) => (method === "unknown" ? "native" : method),
  async getInstalledVersion(instance) {
    return cursorVersionFromPath(instance) ?? versionFromCommand(instance.path);
  },
  getLatestVersion: async () => null,
  async getUpdatePlan(instance): Promise<UpdatePlan> {
    if (instance.installMethod === "brew") {
      return {
        kind: "manual",
        command: "brew upgrade --cask cursor-cli",
        reason: "Installed with Homebrew; let brew manage the upgrade.",
      };
    }
    return { kind: "auto", command: [instance.path, "update"] };
  },
};