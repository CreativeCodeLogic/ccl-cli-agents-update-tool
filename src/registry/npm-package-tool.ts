import type { BinaryInstance, InstallMethod, ToolDescriptor, UpdatePlan } from "../types";
import { fetchLatestNpmVersion, readPackageVersionNear } from "../utils/npm";
import { npmGlobalPlan, versionFromCommand } from "./shared";

export interface NpmPackageToolConfig {
  id: string;
  name: string;
  binNames: string[];
  /** npm package that ships the CLI; also the source of "latest". */
  pkg: string;
  shortName?: string;
  group: ToolDescriptor["group"];
  /** npm packages a project would pin, when they differ from `pkg`. */
  projectPackages?: string[];
  description: string;
  docsUrl: string;
  releaseNotes: ToolDescriptor["releaseNotes"];
  deprecation?: ToolDescriptor["deprecation"];
  refineInstallMethod?: ToolDescriptor["refineInstallMethod"];
  identify?: ToolDescriptor["identify"];
  notes?: ToolDescriptor["notes"];
  /** Plans for installs npm doesn't manage (self-updaters, brew, ...); null = generic manual plan. */
  otherPlan?: (instance: BinaryInstance) => UpdatePlan | null;
}

function genericPlan(pkg: string, method: InstallMethod): UpdatePlan {
  return {
    kind: "manual",
    command: `npm install -g ${pkg}@latest`,
    reason: `Not a global npm install (${method}); update it with the tool you installed it with, or use this to switch to npm.`,
  };
}

/** Descriptor for a CLI distributed as an npm package. */
export function createNpmPackageTool(config: NpmPackageToolConfig): ToolDescriptor {
  const { pkg } = config;
  return {
    id: config.id,
    name: config.name,
    group: config.group,
    binNames: config.binNames,
    npmPackage: pkg,
    ...(config.projectPackages && { projectPackages: config.projectPackages }),
    description: config.description,
    docsUrl: config.docsUrl,
    releaseNotes: config.releaseNotes,
    ...(config.shortName && { shortName: config.shortName }),
    ...(config.deprecation && { deprecation: config.deprecation }),
    ...(config.refineInstallMethod && { refineInstallMethod: config.refineInstallMethod }),
    ...(config.identify && { identify: config.identify }),
    ...(config.notes && { notes: config.notes }),

    // package.json is fast and exact; fall back to running the binary.
    async getInstalledVersion(instance) {
      return (
        (await readPackageVersionNear(instance.path, instance.realPath, pkg)) ??
        versionFromCommand(instance.path)
      );
    },

    getLatestVersion: () => fetchLatestNpmVersion(pkg),

    async getUpdatePlan(instance) {
      return (
        (await npmGlobalPlan(instance, pkg)) ??
        config.otherPlan?.(instance) ??
        genericPlan(pkg, instance.installMethod)
      );
    },
  };
}
