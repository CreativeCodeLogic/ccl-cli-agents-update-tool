import { envVar, getHost, pathFor, type Host } from "./host";

type Platform = NodeJS.Platform;

/** Forward slashes, no trailing slash, lowercase on Windows: for comparisons only. */
export function normalizePath(p: string, platform: Platform = getHost().platform): string {
  const s = p.replace(/\x5c/g, "/").replace(/\/+$/, "");
  return platform === "win32" ? s.toLowerCase() : s;
}

export function samePath(a: string, b: string, platform: Platform = getHost().platform): boolean {
  return normalizePath(a, platform) === normalizePath(b, platform);
}

export function isInside(file: string, dir: string, platform: Platform = getHost().platform): boolean {
  const f = normalizePath(file, platform);
  const d = normalizePath(dir, platform);
  return f === d || f.startsWith(`${d}/`);
}

/** Display form: home directory replaced by "~". */
export function displayPath(p: string, host: Host = getHost()): string {
  return host.homedir && isInside(p, host.homedir, host.platform) ? `~${p.slice(host.homedir.length)}` : p;
}

/** Directory of a binary, for display. */
export function displayDir(binPath: string, host: Host = getHost()): string {
  return displayPath(pathFor(host.platform).dirname(binPath), host);
}

/** Windows: is this path under Program Files (writing there needs an elevated terminal)? */
export function isUnderProgramFiles(p: string, host: Host = getHost()): boolean {
  if (host.platform !== "win32") return false;
  return ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"].some((name) => {
    const root = envVar(host, name);
    return root !== undefined && isInside(p, root, host.platform);
  });
}
