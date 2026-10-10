import { accessSync, constants, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BinaryInstance, ToolDescriptor, UpdatePlan } from "../types";
import { exec } from "../utils/exec";
import { fetchJson, stringField } from "../utils/http";
import { isUnderProgramFiles, normalizePath } from "../utils/paths";
import { brewPlan } from "./shared";

// Release feed of the official SDK; its top-level "version" is the current release.
const COMPONENTS_URL = "https://dl.google.com/dl/cloudsdk/channels/rapid/components-2.json";
// The JSON version command boots Python; only used when the VERSION file is missing.
const VERSION_TIMEOUT_MS = 20_000;

/** SDK root (holds VERSION, bin/, lib/) for one gcloud executable. */
function sdkRoot(instance: BinaryInstance): string | null {
  const candidates =
    instance.installMethod === "snap"
      ? ["/snap/google-cloud-cli/current", "/snap/google-cloud-sdk/current"]
      : [path.dirname(path.dirname(instance.realPath))]; // <root>/bin/gcloud
  return candidates.find((root) => existsSync(path.join(root, "VERSION"))) ?? null;
}

/** Homebrew cask token from the Caskroom path (the cask was renamed google-cloud-sdk -> gcloud-cli). */
function caskToken(instance: BinaryInstance): string {
  const segments = normalizePath(instance.realPath).split("/");
  const i = segments.indexOf("caskroom");
  return (i >= 0 && segments[i + 1]) || "gcloud-cli";
}

function isWritable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const PACKAGE_MANAGED = "the component manager is disabled for package-managed installs.";

function nativePlan(instance: BinaryInstance): UpdatePlan {
  const root = sdkRoot(instance) ?? path.dirname(path.dirname(instance.realPath));
  if (isUnderProgramFiles(root)) {
    return {
      kind: "manual",
      command: "gcloud components update",
      reason: "The SDK is under Program Files; run this from an elevated (Administrator) terminal.",
    };
  }
  if (!isWritable(root)) {
    return {
      kind: "manual",
      command: "sudo gcloud components update",
      reason: `The SDK directory (${root}) is not writable by your user.`,
    };
  }
  return { kind: "auto", command: [instance.path, "components", "update", "--quiet"] };
}

export const gcloud: ToolDescriptor = {
  id: "gcloud",
  name: "Google Cloud CLI",
  binNames: ["gcloud"],
  // Anything that isn't a package-manager install is the official installer/archive.
  refineInstallMethod: (method) => (method === "unknown" ? "native" : method),

  // Reading <root>/VERSION avoids spawning gcloud (which boots Python, ~5s on Windows).
  async getInstalledVersion(instance) {
    const root = sdkRoot(instance);
    if (root) {
      try {
        const version = (await readFile(path.join(root, "VERSION"), "utf8")).trim();
        if (/^\d+\.\d+/.test(version)) return version;
      } catch {
        // fall through to the slow path
      }
    }
    const res = await exec(instance.path, ["version", "--format=json"], VERSION_TIMEOUT_MS);
    if (!res.ok) return null;
    try {
      return stringField(JSON.parse(res.stdout), "Google Cloud SDK");
    } catch {
      return null;
    }
  },

  getLatestVersion: async () => stringField(await fetchJson(COMPONENTS_URL), "version"),

  // `gcloud components update` must never run on apt/snap/brew installs.
  async getUpdatePlan(instance) {
    switch (instance.installMethod) {
      case "apt":
        return {
          kind: "manual",
          command: "sudo apt-get update && sudo apt-get install --only-upgrade google-cloud-cli",
          reason: `Installed from apt; ${PACKAGE_MANAGED}`,
        };
      case "snap":
        return {
          kind: "manual",
          command: "sudo snap refresh google-cloud-cli",
          reason: `Installed from snap; ${PACKAGE_MANAGED}`,
        };
      case "brew":
        return brewPlan(caskToken(instance), true);
      default:
        return nativePlan(instance);
    }
  },
};
