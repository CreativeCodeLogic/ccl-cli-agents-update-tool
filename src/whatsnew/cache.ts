import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cacheDir } from "../utils/cache";
import { debug } from "../utils/debug";
import { getHost, pathFor, type Host } from "../utils/host";
import { sideEffectsBlocked } from "../utils/sandbox";

/*
 * Release notes on disk, one small JSON file per tool + version + source in
 * <cache dir>/whats-new. Notes of a released version don't change: kept 7 days.
 * "No notes" is kept 1 hour (a vendor may still publish them). The folder is
 * capped at 2 MB: writing prunes expired files, then the oldest. Every failure
 * degrades to "not cached" silently (CCL_CAUT_DEBUG says why).
 */

export const NOTES_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const NO_NOTES_TTL_MS = 60 * 60 * 1000;
export const NOTES_CACHE_MAX_BYTES = 2 * 1024 * 1024;
const FOLDER = "whats-new";

export interface CachedNotes {
  state: "ready" | "none";
  /** Sanitized Markdown (state "ready"). */
  notes?: string;
  truncated?: boolean;
  fetchedAt: number;
}

export interface NotesCacheHit {
  entry: CachedNotes;
  /** Still within its TTL (an expired entry is only used when the network fails). */
  fresh: boolean;
}

/** The notes cache folder (null without a home directory). */
export function notesCacheDir(host: Host = getHost()): string | null {
  const dir = cacheDir(host);
  return dir ? pathFor(host.platform).join(dir, FOLDER) : null;
}

const fileName = (key: string) => `${createHash("sha256").update(key).digest("hex").slice(0, 24)}.json`;

function isEntry(value: unknown, key: string): value is CachedNotes & { key: string } {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    e.key === key &&
    (e.state === "ready" || e.state === "none") &&
    typeof e.fetchedAt === "number" &&
    (e.state === "none" || typeof e.notes === "string")
  );
}

export class NotesCache {
  constructor(
    private readonly dir: string | null,
    private readonly now: () => number = Date.now,
    private readonly maxBytes = NOTES_CACHE_MAX_BYTES,
    private readonly platform: NodeJS.Platform = getHost().platform,
  ) {}

  static open(host: Host = getHost(), now: () => number = Date.now): NotesCache {
    return new NotesCache(notesCacheDir(host), now, NOTES_CACHE_MAX_BYTES, host.platform);
  }

  get location(): string | null {
    return this.dir;
  }

  get(key: string): NotesCacheHit | null {
    if (!this.dir || sideEffectsBlocked()) return null;
    try {
      const parsed: unknown = JSON.parse(readFileSync(pathFor(this.platform).join(this.dir, fileName(key)), "utf8"));
      if (!isEntry(parsed, key)) return null;
      const age = this.now() - parsed.fetchedAt;
      const ttl = parsed.state === "ready" ? NOTES_TTL_MS : NO_NOTES_TTL_MS;
      const { key: _key, ...entry } = parsed;
      return { entry, fresh: age >= 0 && age < ttl };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") debug(`ignoring cached notes for ${key}: ${String(error)}`);
      return null;
    }
  }

  set(key: string, entry: Omit<CachedNotes, "fetchedAt">): void {
    if (!this.dir || sideEffectsBlocked()) return;
    try {
      mkdirSync(this.dir, { recursive: true });
      const file = pathFor(this.platform).join(this.dir, fileName(key));
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ key, ...entry, fetchedAt: this.now() }));
      renameSync(tmp, file);
      this.prune();
    } catch (error) {
      debug(`could not cache notes for ${key}: ${String(error)}`);
    }
  }

  /** Drop files older than the notes TTL, then the oldest until the folder fits the cap. */
  prune(): void {
    if (!this.dir) return;
    const join = pathFor(this.platform).join;
    const files = readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const stat = statSync(join(this.dir!, f));
        return { path: join(this.dir!, f), size: stat.size, time: stat.mtimeMs };
      })
      .sort((a, b) => a.time - b.time);
    let total = files.reduce((sum, f) => sum + f.size, 0);
    for (const f of files) {
      if (this.now() - f.time < NOTES_TTL_MS && total <= this.maxBytes) continue;
      rmSync(f.path, { force: true });
      total -= f.size;
    }
  }
}
