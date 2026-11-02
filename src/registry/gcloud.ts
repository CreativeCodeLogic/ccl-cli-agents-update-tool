import { readFile } from "node:fs/promises";
import type { BinaryInstance, ToolDescriptor, UpdatePlan } from "../types";
import { exec } from "../utils/exec";
import { getHost, pathFor, type Host } from "../utils/host";
import { fetchJson, stringField } from "../utils/http";
import { isUnderProgramFiles, normalizePath } from "../utils/paths";
import { brewPlan } from "./shared";
import { changelogFile } from "../whatsnew/sources";

// Release feed of the official SDK; its top-level "version" is the current release.
const COMPONENTS_URL = "https://dl.google.com/dl/cloudsdk/channels/rapid/components-2.json";
// The JSON version command boots Python; only used when the VERSION file is missing.
const VERSION_TIMEOUT_MS = 20_000;

/** SDK root (holds VERSION, bin/, lib/) for one gcloud executable. */
export function sdkRoot(instance: BinaryInstance, host: Host = getHost()): string | null {
  const path = pathFor(host.platform);
  const candidates =
    instance.installMethod === "snap"
      ? ["/snap/google-cloud-cli/current", "/snap/google-cloud-sdk/current"]
      : [path.dirname(path.dirname(instance.realPath))]; // <root>/bin/gcloud
  return candidates.find((root) => host.fs.exists(path.join(root, "VERSION"))) ?? null;
}

/** Homebrew cask token from the Caskroom path (the cask was renamed google-cloud-sdk -> gcloud-cli). */
export function caskToken(instance: BinaryInstance, host: Host = getHost()): string {
  const segments = normalizePath(instance.realPath, host.platform).split("/");
  const i = segments.findIndex((s) => s.toLowerCase() === "caskroom");
  return (i >= 0 && segments[i + 1]) || "gcloud-cli";
}

const PACKAGE_MANAGED = "the component manager is disabled for package-managed installs.";

function nativePlan(instance: BinaryInstance, host: Host): UpdatePlan {
  const path = pathFor(host.platform);
  const root = sdkRoot(instance, host) ?? path.dirname(path.dirname(instance.realPath));
  const auto: UpdatePlan = { kind: "auto", command: [instance.path, "components", "update", "--quiet"] };
  // Already elevated: permissions were the only blocker, so run it.
  if (host.elevated) return auto;
  if (isUnderProgramFiles(root, host)) {
    return {
      kind: "manual",
      command: "gcloud components update",
      reason: "The SDK is under Program Files; run ccl-caut (or this command) from a terminal opened with Run as administrator.",
      needsAdmin: true,
    };
  }
  if (!host.fs.isWritable(root)) {
    return {
      kind: "manual",
      command: "sudo gcloud components update",
      reason: `The SDK directory (${root}) is not writable by your user.`,
      needsAdmin: true,
    };
  }
  return auto;
}

export const gcloud: ToolDescriptor = {
  id: "gcloud",
  group: "dev",
  name: "Google Cloud CLI",
  shortName: "gcloud",
  description: "Manage Google Cloud resources (gcloud, bq, gsutil)",
  docsUrl: "https://cloud.google.com/sdk/docs/install",
  releaseNotes: changelogFile("https://dl.google.com/dl/cloudsdk/channels/rapid/RELEASE_NOTES", "https://cloud.google.com/sdk/docs/release-notes", "## ", " \\("),
  binNames: ["gcloud"],
  // Anything that isn't a package-manager install is the official installer/archive.
  refineInstallMethod: (method) => (method === "unknown" ? "native" : method),
  updateTargetDir: (instance) => sdkRoot(instance),

  // Reading <root>/VERSION avoids spawning gcloud (which boots Python, ~5s on Windows).
  async getInstalledVersion(instance) {
    const root = sdkRoot(instance);
    if (root) {
      try {
        const version = (await readFile(pathFor(getHost().platform).join(root, "VERSION"), "utf8")).trim();
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
    const host = getHost();
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
        return brewPlan(caskToken(instance, host), true);
      default:
        return nativePlan(instance, host);
    }
  },
};
