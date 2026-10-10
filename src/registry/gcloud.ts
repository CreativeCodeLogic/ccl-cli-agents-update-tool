import type { InstallMethod, ToolDescriptor, UpdatePlan } from "../types";
import { exec } from "../utils/exec";
import { createLocator } from "./shared";

// STUB: presence + installed version only. Latest-version lookup comes next.
// Anything that isn't a package-manager install is the official SDK archive/installer.
const locator = createLocator(["gcloud"], (method) => (method === "unknown" ? "native" : method));

// gcloud boots a Python runtime; give it more time than other CLIs.
const VERSION_TIMEOUT_MS = 20_000;

const NATIVE_PLAN: UpdatePlan = {
  kind: "manual",
  command: "gcloud components update",
  reason: "Google Cloud SDK is managed by its own component manager.",
};

const plans: Partial<Record<InstallMethod, UpdatePlan>> = {
  native: NATIVE_PLAN,
  apt: {
    kind: "manual",
    command: "sudo apt-get update && sudo apt-get install --only-upgrade google-cloud-cli",
    reason: "Installed from apt; the component manager is disabled for package-managed installs.",
  },
  snap: {
    kind: "manual",
    command: "sudo snap refresh google-cloud-cli",
    reason: "Installed from snap; the component manager is disabled for package-managed installs.",
  },
  brew: {
    kind: "manual",
    command: "brew upgrade --cask gcloud-cli",
    reason: "Installed with Homebrew; let brew manage the upgrade.",
  },
};

export const gcloud: ToolDescriptor = {
  id: "gcloud",
  name: "Google Cloud CLI",
  binNames: ["gcloud"],
  getBinaryPath: () => locator.binaryPath(),
  detectInstallMethod: () => locator.installMethod(),

  // `gcloud --version` is slow; the JSON form is faster and parseable.
  async getInstalledVersion() {
    const bin = await locator.binaryPath();
    if (!bin) return null;
    const res = await exec(bin, ["version", "--format=json"], VERSION_TIMEOUT_MS);
    if (!res.ok) return null;
    try {
      const sdk: unknown = (JSON.parse(res.stdout) as Record<string, unknown>)["Google Cloud SDK"];
      return typeof sdk === "string" ? sdk : null;
    } catch {
      return null;
    }
  },

  getLatestVersion: async () => null,
  getUpdatePlan: (method) => plans[method] ?? NATIVE_PLAN,
};
