import type { BinaryInstance, InstallMethod, ToolDescriptor, ToolGroup, UpdatePlan } from "../types";
import { getHost } from "../utils/host";
import { fetchLatestPypiVersion } from "../utils/pypi";
import { detectPythonInstall, distInfoVersion, pythonUpdatePlan, type PythonInstall } from "../utils/python";
import { findAllExecutables } from "../utils/which";
import { versionFromCommand } from "./shared";

export interface PythonPackageToolConfig {
  id: string;
  name: string;
  binNames: string[];
  /** PyPI project that ships the CLI; also the source of "latest". */
  pypi: string;
  group: ToolGroup;
  shortName?: string;
  description: string;
  docsUrl: string;
  notes?: ToolDescriptor["notes"];
  deprecation?: ToolDescriptor["deprecation"];
  /** Plans for installs no Python package manager made (brew, a vendor installer, ...); null = generic manual plan. */
  otherPlan?: (instance: BinaryInstance) => UpdatePlan | null;
}

const PYTHON_METHODS: readonly InstallMethod[] = ["uv", "pipx", "pip"];

/** The Python install behind a binary, or null (not made by uv, pipx or pip). */
export function pythonInstallOf(instance: Pick<BinaryInstance, "path" | "realPath">, pypi: string): PythonInstall | null {
  return detectPythonInstall(instance.path, instance.realPath, pypi, getHost());
}

const managerOnPath = (kind: PythonInstall["kind"]) => kind === "pip" || findAllExecutables([kind], getHost()).length > 0;

/** Descriptor for a CLI distributed on PyPI and installed with uv, pipx or pip. */
export function createPythonPackageTool(config: PythonPackageToolConfig): ToolDescriptor {
  const { pypi } = config;
  return {
    id: config.id,
    name: config.name,
    group: config.group,
    binNames: config.binNames,
    description: config.description,
    docsUrl: config.docsUrl,
    ...(config.shortName && { shortName: config.shortName }),
    ...(config.notes && { notes: config.notes }),
    ...(config.deprecation && { deprecation: config.deprecation }),

    // uv launchers on Windows and shims in ~/.local/bin look "native" or unknown by path alone.
    refineInstallMethod: (generic, instance) => pythonInstallOf(instance, pypi)?.kind ?? generic,

    // dist-info METADATA is exact and needs no process; fall back to running the binary.
    async getInstalledVersion(instance) {
      const install = PYTHON_METHODS.includes(instance.installMethod) ? pythonInstallOf(instance, pypi) : null;
      return (install && distInfoVersion(install.sitePackages, pypi, getHost())) ?? versionFromCommand(instance.path);
    },

    getLatestVersion: () => fetchLatestPypiVersion(pypi),

    async getUpdatePlan(instance) {
      const install = pythonInstallOf(instance, pypi);
      if (install) return pythonUpdatePlan(install, pypi, managerOnPath(install.kind));
      return (
        config.otherPlan?.(instance) ?? {
          kind: "manual",
          command: `uv tool upgrade ${pypi}`,
          reason: `Install method not recognized (${instance.installMethod}); update it with the tool you installed it with (uv, pipx or pip).`,
        }
      );
    },

    // Admin rights are judged on the folder the upgrade writes to.
    updateTargetDir: (instance) => {
      const install = pythonInstallOf(instance, pypi);
      return install ? (install.venv ?? install.sitePackages) : null;
    },
  };
}