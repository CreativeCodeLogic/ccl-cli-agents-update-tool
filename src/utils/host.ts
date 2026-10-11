import { accessSync, closeSync, constants, existsSync, openSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync } from "node:fs";
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
  /** Small text file contents, or null when unreadable. */
  readText(p: string): string | null;
  /** Last modification time in ms, or null when the file does not exist. */
  mtimeMs(p: string): number | null;
  /** Names of the entries in a directory ([] when it can't be read). */
  list(dir: string): string[];
}

/** Everything platform-specific that detection depends on. */
export interface Host {
  platform: NodeJS.Platform;
  homedir: string;
  env: Readonly<Record<string, string | undefined>>;
  fs: FsProbe;
  /** ccl-caut runs as administrator/root (set once at startup; never self-elevates). */
  elevated?: boolean;
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
    // On Windows access(W_OK) only checks the read-only flag, not folder permissions,
    // so try to create (and remove) a probe file instead.
    if (process.platform === "win32") {
      const probe = path.join(p, `.ccl-caut-write-test-${process.pid}`);
      try {
        closeSync(openSync(probe, "wx"));
        unlinkSync(probe);
        return true;
      } catch {
        return false;
      }
    }
    try {
      accessSync(p, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  },
  readText(p) {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return null;
    }
  },
  list(dir) {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  },
  mtimeMs(p) {
    try {
      return statSync(p).mtimeMs;
    } catch {
      return null;
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
