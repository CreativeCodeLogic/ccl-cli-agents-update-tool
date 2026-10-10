import type { BinaryInstance, InstallMethod } from "../src/types";
import type { FsProbe, Host } from "../src/utils/host";
import { isInside, normalizePath } from "../src/utils/paths";

/** Windows path from a forward-slash fixture (keeps test sources free of backslash escapes). */
export const win = (p: string): string => p.split("/").join(String.fromCharCode(92));

export interface FakeHostOptions {
  platform: NodeJS.Platform;
  homedir: string;
  env?: Record<string, string>;
  /** Existing (executable) files; their parent directories exist implicitly. */
  files?: string[];
  /** Symlink map: path -> resolved target. */
  links?: Record<string, string>;
  /** Directories (and everything below) the user can write to. */
  writable?: string[];
}

/** In-memory host: no real filesystem, any platform's rules on any OS. */
export function fakeHost(options: FakeHostOptions): Host {
  const { platform } = options;
  const norm = (p: string) => normalizePath(p, platform);
  const files = new Set((options.files ?? []).map(norm));
  const links = new Map(Object.entries(options.links ?? {}).map(([from, to]) => [norm(from), to]));
  const fs: FsProbe = {
    exists: (p) => {
      const n = norm(p);
      return files.has(n) || [...files].some((f) => f.startsWith(`${n}/`));
    },
    isExecutable: (p) => files.has(norm(p)),
    realpath: (p) => links.get(norm(p)) ?? p,
    isWritable: (p) => (options.writable ?? []).some((dir) => isInside(p, dir, platform)),
  };
  return { platform, homedir: options.homedir, env: options.env ?? {}, fs };
}

export function instance(path: string, installMethod: InstallMethod, realPath = path): BinaryInstance {
  return { path, realPath, installMethod };
}
