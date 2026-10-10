import { accessSync, constants, existsSync, realpathSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** The filesystem questions detection needs answered. Faked in tests. */
export interface FsProbe {
  exists(p: string): boolean;
  /** Regular file that could be executed (POSIX: has an execute bit). */
  isExecutable(p: string): boolean;
  /** Symlinks resolved; the input itself when resolution fails. */
  realpath(p: string): string;
  isWritable(p: string): boolean;
}

/** Everything platform-specific that detection depends on. */
export interface Host {
  platform: NodeJS.Platform;
  homedir: string;
  env: Readonly<Record<string, string | undefined>>;
  fs: FsProbe;
}

export const nodeFs: FsProbe = {
  exists: (p) => existsSync(p),
  isExecutable(p) {
    try {
      if (!statSync(p).isFile()) return false;
      if (process.platform !== "win32") accessSync(p, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
  realpath(p) {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  },
  isWritable(p) {
    try {
      accessSync(p, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  },
};

let current: Host = { platform: process.platform, homedir: os.homedir(), env: process.env, fs: nodeFs };

/** The host this run detects on. */
export function getHost(): Host {
  return current;
}

/** Swap the host (tests). Returns a function that restores the previous one. */
export function setHost(host: Host): () => void {
  const previous = current;
  current = host;
  return () => {
    current = previous;
  };
}

/** Path functions for the host's platform (win32 rules even when running on POSIX). */
export function pathFor(platform: NodeJS.Platform): typeof path.posix {
  return platform === "win32" ? path.win32 : path.posix;
}

/** Environment lookup; case-insensitive on Windows, like the OS. */
export function envVar(host: Host, name: string): string | undefined {
  if (host.platform !== "win32") return host.env[name];
  const key = Object.keys(host.env).find((k) => k.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : host.env[key];
}
