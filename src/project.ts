import type { ProjectPin, ToolDescriptor, ToolNote } from "./types";
import { debug } from "./utils/debug";
import { pathFor, type Host } from "./utils/host";

/*
 * Project-copy check: a project that pins its own copy of a CLI (for example
 * firebase-tools in devDependencies) runs that copy through npx/npm scripts,
 * whatever the global version is. Strictly read-only: package.json and
 * node_modules are only read, never written.
 */

const FIELDS = ["dependencies", "devDependencies", "optionalDependencies"] as const;

export interface ProjectManifest {
  /** The package.json that was read. */
  file: string;
  dir: string;
  /** pkg -> where and how it is declared (first field wins, in FIELDS order). */
  deps: Map<string, { range: string; field: ProjectPin["field"] }>;
}

/**
 * The nearest package.json from `cwd` upward, stopping at the filesystem root
 * or at the first folder with a .git directory (a repository's root is the
 * last place a project can start). Malformed files count as "no project"
 * (CCL_CAUT_DEBUG says why).
 */
export function findProjectManifest(cwd: string, host: Host): ProjectManifest | null {
  const path = pathFor(host.platform);
  let dir = path.resolve(cwd);
  for (;;) {
    const file = path.join(dir, "package.json");
    if (host.fs.exists(file)) return readManifest(file, dir, host);
    const parent = path.dirname(dir);
    if (host.fs.exists(path.join(dir, ".git")) || parent === dir) return null;
    dir = parent;
  }
}

function readManifest(file: string, dir: string, host: Host): ProjectManifest | null {
  const text = host.fs.readText(file);
  if (text === null) return null;
  try {
    const json = JSON.parse(text) as Record<string, unknown> | null;
    const deps: ProjectManifest["deps"] = new Map();
    for (const field of FIELDS) {
      const section = json?.[field];
      if (typeof section !== "object" || section === null) continue;
      for (const [pkg, range] of Object.entries(section)) {
        if (typeof range === "string" && !deps.has(pkg)) deps.set(pkg, { range, field });
      }
    }
    return { file, dir, deps };
  } catch (error) {
    debug(`ignoring ${file}: ${String(error)}`);
    return null;
  }
}

/** npm packages that would be this tool's project copy. */
export function projectPackagesOf(tool: Pick<ToolDescriptor, "npmPackage" | "projectPackages">): string[] {
  return tool.projectPackages ?? (tool.npmPackage ? [tool.npmPackage] : []);
}

export function projectPinFor(
  tool: Pick<ToolDescriptor, "npmPackage" | "projectPackages">,
  project: ProjectManifest | null,
  host: Host,
): ProjectPin | null {
  if (!project) return null;
  for (const pkg of projectPackagesOf(tool)) {
    const dep = project.deps.get(pkg);
    if (!dep) continue;
    const path = pathFor(host.platform);
    const local = host.fs.readText(path.join(project.dir, "node_modules", ...pkg.split("/"), "package.json"));
    let installedVersion: string | null = null;
    try {
      const version = local ? (JSON.parse(local) as { version?: unknown }).version : undefined;
      installedVersion = typeof version === "string" ? version : null;
    } catch {
      installedVersion = null;
    }
    return { packageJson: project.file, pkg, range: dep.range, field: dep.field, installedVersion };
  }
  return null;
}

/** "This project pins firebase-tools ^13.0.0 (devDependencies; 13.29.1 in node_modules). ..." */
export function projectPinNote(pin: ProjectPin, bin: string): ToolNote {
  const where = pin.installedVersion ? `${pin.field}; ${pin.installedVersion} in node_modules` : pin.field;
  return {
    kind: "info",
    message: `This project pins ${pin.pkg} ${pin.range} (${where}). Updating the global copy won't affect it; use \`npx ${bin}\` here.`,
  };
}