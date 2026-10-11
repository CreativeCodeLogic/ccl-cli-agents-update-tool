import type { BinaryInstance } from "../types";
import { getHost, pathFor, type Host } from "../utils/host";
import { normalizePath } from "../utils/paths";

/**
 * The binary belongs to one of these npm packages: its symlink target lives in
 * node_modules/<pkg>/ (POSIX), or it is an npm shim next to node_modules/<pkg>
 * (Windows .cmd/.ps1 shims are not symlinks).
 */
export function ownedByNpmPackage(instance: Pick<BinaryInstance, "path" | "realPath">, pkgs: readonly string[], host: Host = getHost()): string | null {
  const real = normalizePath(instance.realPath, host.platform);
  for (const pkg of pkgs) {
    if (real.includes(`/node_modules/${pkg.toLowerCase()}/`) || real.includes(`/node_modules/${pkg}/`)) return pkg;
  }
  if (host.platform === "win32") {
    const path = pathFor(host.platform);
    const dir = path.dirname(instance.path);
    for (const pkg of pkgs) if (host.fs.exists(path.join(dir, "node_modules", ...pkg.split("/"), "package.json"))) return pkg;
  }
  return null;
}

/** Homebrew installed this binary from the formula or cask `token` (Cellar/<token>/ or Caskroom/<token>/). */
export function fromBrewToken(instance: Pick<BinaryInstance, "realPath">, token: string, host: Host = getHost()): boolean {
  const real = normalizePath(instance.realPath, host.platform).toLowerCase();
  return real.includes(`/cellar/${token}/`) || real.includes(`/caskroom/${token}/`);
}

/**
 * Linux distributions put packages in /usr/bin for both apt and dnf; /etc/os-release
 * tells them apart (ID / ID_LIKE). Defaults to apt.
 */
export function linuxPackageManager(host: Host = getHost()): "apt" | "dnf" | "zypper" {
  const release = (host.fs.readText("/etc/os-release") ?? "").toLowerCase();
  const ids = /^(?:id|id_like)=(.*)$/gm;
  const words: string[] = [];
  for (const m of release.matchAll(ids)) words.push(...m[1]!.replace(/"/g, "").split(/\s+/));
  if (words.some((w) => ["fedora", "rhel", "centos", "amzn", "rocky", "almalinux"].includes(w))) return "dnf";
  if (words.some((w) => w.includes("suse"))) return "zypper";
  return "apt";
}