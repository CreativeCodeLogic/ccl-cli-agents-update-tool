import semver from "semver";
import type { BinaryInstance, Compatibility, KeyedLookup, UpdatePlan } from "../types";
import { authorizedGithubGet } from "./github";
import { envVar, pathFor, type Host } from "./host";
import { isInside } from "./paths";

/*
 * winget (Windows Package Manager). Updates run automatically only for tools on
 * the allowlist (ToolDescriptor.winget.auto: a real silent upgrade from an older
 * to a newer version passed), and only for per-user installs: machine-scope
 * installs need elevation, which ccl-caut never does.
 *
 * Flags (https://learn.microsoft.com/en-us/windows/package-manager/winget/upgrade):
 *   --id <Id> --exact          this package only (exact, case-sensitive match)
 *   --source winget            the community repository, not the Microsoft Store
 *   --scope user               the per-user install only (never the machine-wide one)
 *   --silent                   the installer runs silently
 *   --accept-source-agreements / --accept-package-agreements   no agreement prompts
 *   --disable-interactivity    no interactive prompts at all
 * Return codes (https://github.com/microsoft/winget-cli/blob/master/doc/windows/package-manager/winget/returnCodes.md).
 */

export interface WingetPackage {
  /** winget package identifier, e.g. GitHub.Copilot. */
  id: string;
  /** On the allowlist: a real silent upgrade was verified (see docs). */
  auto: boolean;
}

export function wingetUpgradeCommand(id: string): string[] {
  return ["winget", "upgrade", "--id", id, "--exact", "--source", "winget", "--scope", "user", "--silent", "--accept-source-agreements", "--accept-package-agreements", "--disable-interactivity"];
}

/**
 * Install scope from where winget put the package: per-user portable packages
 * and their command aliases live in %LOCALAPPDATA%\Microsoft\WinGet, machine-scope
 * portable packages in %ProgramFiles%\WinGet. Anything else: unknown (null).
 */
export function wingetScope(instance: Pick<BinaryInstance, "path" | "realPath">, host: Host): "user" | "machine" | null {
  const path = pathFor(host.platform);
  const local = envVar(host, "LOCALAPPDATA") ?? path.join(host.homedir, "AppData", "Local");
  const programFiles = envVar(host, "ProgramFiles");
  const inside = (dir: string | undefined) => Boolean(dir) && [instance.path, instance.realPath].some((p) => isInside(p, dir!, host.platform));
  if (inside(path.join(local, "Microsoft", "WinGet"))) return "user";
  if (programFiles && inside(path.join(programFiles, "WinGet"))) return "machine";
  return null;
}

/** The plan for a winget install: automatic only when allowlisted and per-user. */
export function wingetPlan(instance: Pick<BinaryInstance, "path" | "realPath">, pkg: WingetPackage, host: Host): UpdatePlan {
  const manual = `winget upgrade --id ${pkg.id} --exact --source winget`;
  const scope = wingetScope(instance, host);
  if (scope === "machine") {
    return { kind: "manual", command: manual, reason: "Installed with winget for all users (machine scope); upgrading it needs an elevated terminal.", needsAdmin: true };
  }
  if (pkg.auto && scope === "user") return { kind: "auto", command: wingetUpgradeCommand(pkg.id) };
  return {
    kind: "manual",
    command: manual,
    reason: pkg.auto ? "Installed with winget, but its install scope is unclear; let winget manage the upgrade." : "Installed with winget; let winget manage the upgrade.",
  };
}

/** HRESULTs as signed or unsigned exit codes. */
const codeOf = (hresult: number) => [hresult | 0, hresult >>> 0];
const NOT_APPLICABLE = [...codeOf(0x8a15002b), ...codeOf(0x8a15004f)]; // no applicable update / not newer
const IN_USE = codeOf(0x8a150101); // application is running
const NEEDS_ADMIN = codeOf(0x8a150019); // command requires administrator privileges

export function isWingetCommand(command: readonly string[]): boolean {
  return pathFor("win32").parse(command[0] ?? "").name.toLowerCase() === "winget";
}

/** What a non-zero winget exit code means for the user, or null (a real failure). */
export function wingetExitKind(code: number | null): "not-applicable" | "in-use" | "needs-admin" | null {
  if (code === null) return null;
  if (NOT_APPLICABLE.includes(code)) return "not-applicable";
  if (IN_USE.includes(code)) return "in-use";
  if (NEEDS_ADMIN.includes(code)) return "needs-admin";
  return null;
}

/** manifests/<first letter>/<Publisher>/<Package> in microsoft/winget-pkgs. */
export function wingetManifestPath(id: string): string | null {
  const parts = id.split(".");
  if (parts.length < 2 || !parts[0]) return null;
  return `manifests/${parts[0][0]!.toLowerCase()}/${parts.join("/")}`;
}

/** The highest version folder (folders may be "v1.0.98" or "1.4.2"; sub-packages are skipped). */
export function newestWingetVersion(names: readonly string[]): string | null {
  const versions = names.filter((n) => /^v?\d+(\.\d+)+$/i.test(n)).map((n) => n.replace(/^v/i, ""));
  return versions.sort((a, b) => semver.rcompare(semver.coerce(a)!, semver.coerce(b)!))[0] ?? null;
}

/** Newest version published in the winget repository (microsoft/winget-pkgs), or null. */
export async function fetchWingetRepoVersion(id: string): Promise<string | null> {
  const dir = wingetManifestPath(id);
  if (!dir) return null;
  const listing = await authorizedGithubGet(`https://api.github.com/repos/microsoft/winget-pkgs/contents/${dir}`);
  if (!Array.isArray(listing)) return null;
  const names = listing.filter((e): e is { type: string; name: string } => typeof e === "object" && e !== null && (e as { type?: unknown }).type === "dir").map((e) => e.name);
  return newestWingetVersion(names);
}

/**
 * winget's repository often lags behind the vendor. When the latest version
 * isn't in winget yet, don't attempt the update: say so (never a failure).
 * Unknown (lookup failed): no opinion; winget's own "no applicable update"
 * answer is handled when the update runs.
 */
export async function wingetAvailability(pkg: WingetPackage, toolName: string, latest: string, lookup: KeyedLookup): Promise<Compatibility | null> {
  const inWinget = await lookup(`winget:${pkg.id}`, () => fetchWingetRepoVersion(pkg.id));
  const a = inWinget && semver.coerce(inWinget);
  const b = semver.coerce(latest);
  if (!a || !b || semver.gte(a, b)) return null;
  const message = `${toolName} ${latest} isn't in winget yet (winget has ${inWinget}); waiting for winget.`;
  return {
    message,
    plan: { kind: "manual", command: `winget upgrade --id ${pkg.id} --exact --source winget`, reason: `${message} Run this once winget has the new version, or try again later.` },
  };
}