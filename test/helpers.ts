import type { BinaryInstance, InstallMethod } from "../src/types";
import type { FsProbe, Host } from "../src/utils/host";
import { Network, setNetwork } from "../src/utils/http";
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
  /** Text file contents (these files exist too). */
  texts?: Record<string, string>;
  /** Modification times in ms. */
  mtimes?: Record<string, number>;
}

/** In-memory host: no real filesystem, any platform's rules on any OS. */
export function fakeHost(options: FakeHostOptions): Host {
  const { platform } = options;
  const norm = (p: string) => normalizePath(p, platform);
  const files = new Set((options.files ?? []).map(norm));
  const links = new Map(Object.entries(options.links ?? {}).map(([from, to]) => [norm(from), to]));
  const texts = new Map(Object.entries(options.texts ?? {}).map(([p, text]) => [norm(p), text]));
  const mtimes = new Map(Object.entries(options.mtimes ?? {}).map(([p, ms]) => [norm(p), ms]));
  for (const p of texts.keys()) files.add(p);
  const fs: FsProbe = {
    exists: (p) => {
      const n = norm(p);
      return files.has(n) || [...files].some((f) => f.startsWith(`${n}/`));
    },
    isExecutable: (p) => files.has(norm(p)),
    realpath: (p) => links.get(norm(p)) ?? p,
    list: (dir) => {
      const prefix = `${norm(dir)}/`;
      const names = new Set<string>();
      for (const f of files) if (f.startsWith(prefix)) names.add(f.slice(prefix.length).split("/")[0]!);
      return [...names];
    },
    isWritable: (p) => (options.writable ?? []).some((dir) => isInside(p, dir, platform)),
    readText: (p) => texts.get(norm(p)) ?? null,
    mtimeMs: (p) => mtimes.get(norm(p)) ?? (files.has(norm(p)) ? 0 : null),
  };
  return { platform, homedir: options.homedir, env: options.env ?? {}, fs };
}

export function instance(path: string, installMethod: InstallMethod, realPath = path): BinaryInstance {
  return { path, realPath, installMethod };
}

/**
 * Route lookups through `fetch` (a vi.fn) instead of the network, without the
 * warm-up request. Call the returned restore() in afterEach.
 */
export function useFakeFetch(fetch: (url: string, init: { headers: Record<string, string> }) => Promise<Response> | Response): () => void {
  return setNetwork(new Network({ fetch: async (url, init) => fetch(url, { headers: init.headers }), dispatcher: () => undefined, warmUpUrl: null }));
}