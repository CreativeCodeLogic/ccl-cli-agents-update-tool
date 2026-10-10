import type { InstallMethod, ToolDescriptor, UpdatePlan } from "../types";
import { fetchLatestNpmVersion, readGlobalPackageVersion } from "../utils/npm";
import { createLocator, versionFromCommand } from "./shared";

export interface NpmPackageToolConfig {
  id: string;
  name: string;
  binNames: string[];
  /** npm package that ships the CLI; also the source of "latest". */
  pkg: string;
  /** Refine the generic path-based method (e.g. map "unknown" to "native"). */
  refineMethod?: (method: InstallMethod, binPath: string) => InstallMethod;
  /** Plans for non-npm installs; falls back to a generic manual plan. */
  manualPlans?: Partial<Record<InstallMethod, UpdatePlan>>;
}

/** Descriptor for a CLI distributed as an npm package. Only npm installs get an "auto" plan. */
export function createNpmPackageTool(config: NpmPackageToolConfig): ToolDescriptor {
  const locator = createLocator(config.binNames, config.refineMethod);

  return {
    id: config.id,
    name: config.name,
    binNames: config.binNames,
    getBinaryPath: () => locator.binaryPath(),
    detectInstallMethod: () => locator.installMethod(),

    async getInstalledVersion() {
      const method = await locator.installMethod();
      if (!method) return null;
      // Reading package.json is fast and exact; fall back to running the binary.
      if (method === "npm") {
        const fromPkg = await readGlobalPackageVersion(config.pkg);
        if (fromPkg) return fromPkg;
      }
      return versionFromCommand(await locator.binaryPath());
    },

    getLatestVersion: () => fetchLatestNpmVersion(config.pkg),

    getUpdatePlan(method) {
      if (method === "npm") {
        return { kind: "auto", command: ["npm", "install", "-g", `${config.pkg}@latest`] };
      }
      return (
        config.manualPlans?.[method] ?? {
          kind: "manual",
          command: `npm install -g ${config.pkg}@latest`,
          reason: `Not a global npm install (${method}); update it with the tool you installed it with, or use this to switch to npm.`,
        }
      );
    },
  };
}
