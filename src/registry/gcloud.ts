import type { InstallMethod, ToolDescriptor, UpdatePlan } from "../types";
import { exec } from "../utils/exec";
import { stringField } from "../utils/http";
import { brewPlan } from "./shared";

// STUB: presence + installed version only. Latest-version lookup comes next.

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
  brew: brewPlan("gcloud-cli", true),
};

export const gcloud: ToolDescriptor = {
  id: "gcloud",
  name: "Google Cloud CLI",
  binNames: ["gcloud"],
  // Anything that isn't a package-manager install is the official installer/archive.
  refineInstallMethod: (method) => (method === "unknown" ? "native" : method),

  // `gcloud --version` is slow; the JSON form is faster and parseable.
  async getInstalledVersion(instance) {
    const res = await exec(instance.path, ["version", "--format=json"], VERSION_TIMEOUT_MS);
    if (!res.ok) return null;
    try {
      return stringField(JSON.parse(res.stdout), "Google Cloud SDK");
    } catch {
      return null;
    }
  },

  getLatestVersion: async () => null,
  getUpdatePlan: async (instance) => plans[instance.installMethod] ?? NATIVE_PLAN,
};
