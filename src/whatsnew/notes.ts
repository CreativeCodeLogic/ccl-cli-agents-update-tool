import { githubApiHeaders, githubTokenSource } from "../utils/github";
import { describeFailure, getNetwork, type NetFailure, type TextResult } from "../utils/http";
import { sideEffectsBlocked } from "../utils/sandbox";
import type { NotesCache } from "./cache";
import type { PopupContent } from "./popup";
import { sanitize } from "./sanitize";
import { historyLink, notesLink, releaseApiUrl, type ReleaseNotesSource } from "./sources";

/*
 * The notes for exactly the version CCL CAUT shows as Latest, fetched on
 * demand (never during a scan). No notes for that version means "No release
 * notes for <version>": never an older release's notes instead.
 */

/** Most text a changelog download may have (a server ignoring Range stops here). */
export const NOTES_DOWNLOAD_CAP = 256 * 1024;
/** Most a GitHub release answer may have: JSON is read whole, and big asset lists (codex: ~670 KB) come with it. */
export const RELEASE_JSON_CAP = 2 * 1024 * 1024;
/** Most notes shown; longer ones end with "Notes cut here. Full notes: <link>". */
export const NOTES_RENDER_CAP = 64 * 1024;

export interface NotesTarget {
  /** Cache key part and --whats-new id. */
  id: string;
  name: string;
  /** The version CCL CAUT shows as Latest (null: not known). */
  version: string | null;
  installed?: string | null;
  source: ReleaseNotesSource;
}

export type FetchText = (url: string, init: { headers?: Record<string, string>; maxBytes: number; signal?: AbortSignal }) => Promise<TextResult>;

export interface NotesDeps {
  fetchText?: FetchText;
  cache?: NotesCache | null;
  env?: Readonly<Record<string, string | undefined>>;
}

/** The result, plus where it came from (--whats-new --json, the canary). */
export type NotesResult = PopupContent & { from?: "network" | "cache" | "stale-cache" };

/** Identifies one version's notes in one source (Kimi's two repos never share an entry). */
export function notesKey(target: NotesTarget): string {
  const s = target.source;
  const where = s.kind === "github-release" ? `${s.repo}#${target.version ? s.tag(target.version) : ""}` : s.kind === "changelog-file" ? s.url : s.url;
  return `${target.id}@${target.version ?? ""}|${where}`;
}

/** Cut notes longer than NOTES_RENDER_CAP at the last line break before it. */
export function capNotes(text: string, cap = NOTES_RENDER_CAP): { notes: string; truncated: boolean } {
  if (text.length <= cap) return { notes: text, truncated: false };
  const cut = text.lastIndexOf("\n", cap);
  return { notes: text.slice(0, cut > 0 ? cut : cap).trimEnd(), truncated: true };
}

/**
 * The version's section of a Markdown changelog: from its heading (excluded) to
 * the next heading of the same or a higher level. `complete` = false when the
 * text ends before the next heading (only the first part of the file was read).
 */
export function changelogSection(text: string, heading: RegExp): { body: string; complete: boolean } | null {
  const match = heading.exec(text);
  if (!match) return null;
  const level = /^(#+)/.exec(match[0])?.[1]?.length ?? 2;
  const start = text.indexOf("\n", match.index);
  if (start < 0) return { body: "", complete: false };
  const rest = text.slice(start + 1);
  const next = new RegExp(`^#{1,${level}}\\s`, "m").exec(rest);
  if (next) return { body: rest.slice(0, next.index).trim(), complete: true };
  // Read only partly: drop the last (possibly cut) line.
  const lastBreak = rest.lastIndexOf("\n");
  return { body: (lastBreak > 0 ? rest.slice(0, lastBreak) : rest).trim(), complete: false };
}

type Outcome = { state: "ready"; notes: string; truncated: boolean } | { state: "none" } | { state: "error"; error: string };

function failureMessage(failure: NetFailure, env: Readonly<Record<string, string | undefined>>): string {
  if (failure.rateLimit) return `GitHub rate limit reached${githubTokenSource(env) ? "" : "; set GITHUB_TOKEN for higher limits"}`;
  return describeFailure(failure);
}

async function fromGithub(source: Extract<ReleaseNotesSource, { kind: "github-release" }>, version: string, fetchText: FetchText, env: Readonly<Record<string, string | undefined>>, signal?: AbortSignal): Promise<Outcome> {
  const result = await fetchText(releaseApiUrl(source.repo, source.tag(version)), { headers: githubApiHeaders(env), maxBytes: RELEASE_JSON_CAP, ...(signal && { signal }) });
  if (!result.ok) return result.status === 404 ? { state: "none" } : { state: "error", error: failureMessage(result.failure, env) };
  if (result.capped) return { state: "error", error: "the release is too large to read here" };
  let body: unknown;
  try {
    body = (JSON.parse(result.text) as { body?: unknown }).body;
  } catch {
    return { state: "error", error: "GitHub sent an answer CCL CAUT can't read" };
  }
  if (typeof body !== "string" || !body.trim()) return { state: "none" };
  return { state: "ready", ...capNotes(sanitize(body).trim()) };
}

async function fromChangelog(source: Extract<ReleaseNotesSource, { kind: "changelog-file" }>, version: string, fetchText: FetchText, env: Readonly<Record<string, string | undefined>>, signal?: AbortSignal): Promise<Outcome> {
  const result = await fetchText(source.url, { headers: { accept: "text/plain, text/markdown, */*", range: `bytes=0-${source.rangeBytes - 1}` }, maxBytes: NOTES_DOWNLOAD_CAP, ...(signal && { signal }) });
  if (!result.ok) return { state: "error", error: failureMessage(result.failure, env) };
  // 206: the server sent the first part we asked for. 200: it ignored Range and sent the file (cut at the cap).
  const partial = result.status === 206 || result.capped;
  const section = changelogSection(sanitize(result.text), source.heading(version));
  if (!section) {
    // The newest notes are at the top: missing from the first part = not published (yet).
    if (result.status === 200 && result.capped) return { state: "error", error: "the notes file is too large to read here" };
    return { state: "none" };
  }
  if (!section.body) return { state: "none" };
  const capped = capNotes(section.body);
  return { state: "ready", notes: capped.notes, truncated: capped.truncated || (!section.complete && partial) };
}

/** Fetch (or read from the cache) the notes for `target`. Never rejects. */
export async function loadNotes(target: NotesTarget, deps: NotesDeps = {}, signal?: AbortSignal): Promise<NotesResult> {
  const env = deps.env ?? process.env;
  const base: PopupContent = {
    tool: target.name,
    version: target.version ?? "",
    state: "none",
    link: notesLink(target.source, target.version),
    historyLink: historyLink(target.source),
    ...(target.installed && target.version && target.installed !== target.version && { installed: target.installed }),
  };
  if (target.source.kind === "link-only") return { ...base, state: "link-only" };
  if (!target.version) return base;

  const key = notesKey(target);
  const cache = deps.cache ?? null;
  const hit = cache?.get(key) ?? null;
  const fromCache = (entry: NonNullable<typeof hit>["entry"], from: "cache" | "stale-cache"): NotesResult =>
    entry.state === "ready"
      ? { ...base, state: "ready", notes: sanitize(entry.notes ?? ""), ...(entry.truncated && { truncated: true }), from }
      : { ...base, state: "none", from };
  if (hit?.fresh) return fromCache(hit.entry, "cache");

  const blocked = sideEffectsBlocked();
  if (blocked) return { ...base, state: "error", error: `not fetched (${blocked})` };
  const fetchText: FetchText = deps.fetchText ?? ((url, init) => getNetwork().fetchText(url, init));
  const outcome =
    target.source.kind === "github-release"
      ? await fromGithub(target.source, target.version, fetchText, env, signal)
      : await fromChangelog(target.source, target.version, fetchText, env, signal);

  if (outcome.state === "error") {
    // Offline or rate limited: notes cached earlier (even expired) are still the right notes.
    if (hit) return fromCache(hit.entry, "stale-cache");
    return { ...base, state: "error", error: outcome.error };
  }
  if (signal?.aborted) return { ...base, state: "error", error: "cancelled" };
  cache?.set(key, outcome.state === "ready" ? { state: "ready", notes: outcome.notes, ...(outcome.truncated && { truncated: true }) } : { state: "none" });
  return outcome.state === "ready"
    ? { ...base, state: "ready", notes: outcome.notes, ...(outcome.truncated && { truncated: true }), from: "network" }
    : { ...base, state: "none", from: "network" };
}
