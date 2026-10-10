import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { debug } from "./debug";
import { envVar, getHost, pathFor, type Host } from "./host";
import { sideEffectsBlocked } from "./sandbox";

const APP_DIR = "ccl-caut";
const FILE_NAME = "latest-versions.json";
export const CACHE_TTL_MS = 60 * 60 * 1000;

interface Entry {
  version: string;
  fetchedAt: number;
}

interface CacheFile {
  schema: 1;
  entries: Record<string, Entry>;
}

/** OS cache directory for this app (null if no home directory is known). */
export function cacheDir(host: Host = getHost()): string | null {
  const path = pathFor(host.platform);
  if (host.platform === "win32") {
    const local = envVar(host, "LOCALAPPDATA") ?? (host.homedir && path.join(host.homedir, "AppData", "Local"));
    return local ? path.join(local, APP_DIR) : null;
  }
  if (host.platform === "darwin") return host.homedir ? path.join(host.homedir, "Library", "Caches", APP_DIR) : null;
  const base = envVar(host, "XDG_CACHE_HOME") || (host.homedir && path.join(host.homedir, ".cache"));
  return base ? path.join(base, APP_DIR) : null;
}

function isEntry(value: unknown): value is Entry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e.version === "string" && typeof e.fetchedAt === "number" && Number.isFinite(e.fetchedAt);
}

/**
 * Latest-version cache on disk with a 1h TTL. Every failure (missing, corrupt,
 * unwritable) degrades to "no cache" silently; CCL_CAUT_DEBUG shows why.
 */
export class VersionCache {
  private dirty = false;

  private constructor(
    private readonly file: string | null,
    private readonly entries: Record<string, Entry>,
    private readonly now: () => number,
  ) {}

  static load(host: Host = getHost(), now: () => number = Date.now): VersionCache {
    const dir = cacheDir(host);
    const file = dir ? pathFor(host.platform).join(dir, FILE_NAME) : null;
    const entries: Record<string, Entry> = {};
    if (file) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
        const raw = (parsed as Partial<CacheFile> | null)?.entries;
        if ((parsed as Partial<CacheFile> | null)?.schema !== 1 || typeof raw !== "object" || raw === null) {
          throw new Error("unexpected cache format");
        }
        for (const [key, value] of Object.entries(raw)) if (isEntry(value)) entries[key] = value;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") debug(`ignoring cache ${file}: ${String(error)}`);
      }
    }
    return new VersionCache(file, entries, now);
  }

  /** Fresh entry for `key`, or null when missing or expired. */
  get(key: string): Entry | null {
    const entry = this.entries[key];
    if (!entry) return null;
    const age = this.now() - entry.fetchedAt;
    return age >= 0 && age < CACHE_TTL_MS ? entry : null;
  }

  set(key: string, version: string): void {
    this.entries[key] = { version, fetchedAt: this.now() };
    this.dirty = true;
  }

  /** Forget every channel of one tool (keys are "<toolId>:<channel>"). */
  dropTool(toolId: string): void {
    for (const key of Object.keys(this.entries)) {
      if (key.startsWith(`${toolId}:`)) {
        delete this.entries[key];
        this.dirty = true;
      }
    }
  }

  /** Persist if anything changed. Never throws. */
  save(host: Host = getHost()): void {
    if (!this.dirty || !this.file || sideEffectsBlocked()) return;
    try {
      const path = pathFor(host.platform);
      mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      const data: CacheFile = { schema: 1, entries: this.entries };
      writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
      renameSync(tmp, this.file);
      this.dirty = false;
    } catch (error) {
      debug(`could not write cache ${this.file}: ${String(error)}`);
    }
  }
}
