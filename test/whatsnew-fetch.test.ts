import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registry } from "../src/registry";
import type { ToolScan } from "../src/types";
import { checklist, choose, NOTES, NOTES_TOO_SMALL, QUIT } from "../src/ui/prompts";
import { iconSet } from "../src/ui/symbols";
import { Network, type FetchImpl, type TextResult } from "../src/utils/http";
import { NO_NOTES_TTL_MS, NotesCache, NOTES_TTL_MS } from "../src/whatsnew/cache";
import { rowsForWhatsNew } from "../src/whatsnew/flow";
import { changelogSection, loadNotes, NOTES_DOWNLOAD_CAP, NOTES_RENDER_CAP, RELEASE_JSON_CAP, type FetchText, type NotesTarget } from "../src/whatsnew/notes";
import { bodyLines, inlineNotes, renderPopup, showNotes } from "../src/whatsnew/popup";
import { historyLink, notesLink, releaseApiUrl, resolveSource, SELF_NOTES } from "../src/whatsnew/sources";

const ESC = "\u001b";
const tool = (id: string) => registry.find((t) => t.id === id)!;
const sourceOf = (id: string, method: Parameters<typeof resolveSource>[1] = "npm") => resolveSource(tool(id).releaseNotes, method, null);

/*
 * The verified examples of docs/whats-new-sources.md (2026-10-24): each tool's
 * Latest -> its official notes. No network: the requests are only built here.
 */
const RELEASES: [id: string, version: string, link: string, api: string][] = [
  ["antigravity", "1.4.7", "https://github.com/google-antigravity/antigravity-cli/releases/tag/1.4.7", "https://api.github.com/repos/google-antigravity/antigravity-cli/releases/tags/1.4.7"],
  ["claude", "2.1.310", "https://github.com/anthropics/claude-code/releases/tag/v2.1.310", "https://api.github.com/repos/anthropics/claude-code/releases/tags/v2.1.310"],
  ["cline", "3.0.73", "https://github.com/cline/cline/releases/tag/cli-v3.0.73", "https://api.github.com/repos/cline/cline/releases/tags/cli-v3.0.73"],
  ["codex", "0.164.0", "https://github.com/openai/codex/releases/tag/rust-v0.164.0", "https://api.github.com/repos/openai/codex/releases/tags/rust-v0.164.0"],
  ["copilot", "1.0.103", "https://github.com/github/copilot-cli/releases/tag/v1.0.103", "https://api.github.com/repos/github/copilot-cli/releases/tags/v1.0.103"],
  ["firebase", "15.34.1", "https://github.com/firebase/firebase-tools/releases/tag/v15.34.1", "https://api.github.com/repos/firebase/firebase-tools/releases/tags/v15.34.1"],
  ["gemini", "0.65.0", "https://github.com/google-gemini/gemini-cli/releases/tag/v0.65.0", "https://api.github.com/repos/google-gemini/gemini-cli/releases/tags/v0.65.0"],
  ["gh", "2.103.2", "https://github.com/cli/cli/releases/tag/v2.103.2", "https://api.github.com/repos/cli/cli/releases/tags/v2.103.2"],
  ["goose", "1.56.0", "https://github.com/aaif-goose/goose/releases/tag/v1.56.0", "https://api.github.com/repos/aaif-goose/goose/releases/tags/v1.56.0"],
  ["kimi", "2.3.1", "https://github.com/MoonshotAI/kimi-code/releases/tag/%40moonshot-ai/kimi-code%402.3.1", "https://api.github.com/repos/MoonshotAI/kimi-code/releases/tags/%40moonshot-ai%2Fkimi-code%402.3.1"],
  ["netlify", "27.14.2", "https://github.com/netlify/cli/releases/tag/v27.14.2", "https://api.github.com/repos/netlify/cli/releases/tags/v27.14.2"],
  ["npm", "12.2.1", "https://github.com/npm/cli/releases/tag/v12.2.1", "https://api.github.com/repos/npm/cli/releases/tags/v12.2.1"],
  ["opencode", "1.19.4", "https://github.com/anomalyco/opencode/releases/tag/v1.19.4", "https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.19.4"],
  ["qwen", "0.26.0", "https://github.com/QwenLM/qwen-code/releases/tag/v0.26.0", "https://api.github.com/repos/QwenLM/qwen-code/releases/tags/v0.26.0"],
  ["supabase", "2.122.0", "https://github.com/supabase/cli/releases/tag/v2.122.0", "https://api.github.com/repos/supabase/cli/releases/tags/v2.122.0"],
  ["vibe", "3.0.2", "https://github.com/mistralai/mistral-vibe/releases/tag/v3.0.2", "https://api.github.com/repos/mistralai/mistral-vibe/releases/tags/v3.0.2"],
];

/** Changelog files: the verified heading matches its version, and nothing else does. */
const CHANGELOGS: [id: string, version: string, heading: string, notHeadings: string[]][] = [
  ["aider", "0.86.1", "### Aider v0.86.1", ["### Aider v0.86.10", "## Aider v0.86.1", "### Aider v0.86.12"]],
  ["wrangler", "4.152.0", "## 4.152.0", ["## 4.152.01", "### 4.152.0", "## 4.152.0-beta"]],
  ["gcloud", "590.0.1", "## 590.0.1 (2026-10-22)", ["## 590.0.10 (2026-10-29)", "## 590.0.1", "### 590.0.1 (2026-10-22)"]],
];

describe("release-note sources (registry), per docs/whats-new-sources.md", () => {
  it("every tool has one, of a known kind", () => {
    for (const t of registry) {
      const s = resolveSource(t.releaseNotes);
      expect(["github-release", "changelog-file", "link-only"], t.id).toContain(s.kind);
    }
    expect(registry.length).toBe(23);
  });

  it.each(RELEASES)("%s %s -> its release (link and the one API request)", (id, version, link, api) => {
    const s = sourceOf(id);
    if (s.kind !== "github-release") throw new Error(`${id}: ${s.kind}`);
    expect(notesLink(s, version)).toBe(link);
    expect(releaseApiUrl(s.repo, s.tag(version))).toBe(api);
    expect(historyLink(s)).toBe(`https://github.com/${s.repo}/releases`);
  });

  it("Kimi: the legacy Python CLI (uv, pipx, pip) uses its own repo, tag without v", () => {
    for (const method of ["uv", "pipx", "pip"] as const) {
      expect(notesLink(sourceOf("kimi", method), "1.52.0")).toBe("https://github.com/MoonshotAI/kimi-cli/releases/tag/1.52.0");
    }
  });

  it("CCL CAUT itself: its GitHub releases, tag v<version>", () => {
    expect(notesLink(SELF_NOTES, "1.1.0")).toBe("https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/releases/tag/v1.1.0");
  });

  it.each(CHANGELOGS)("%s %s -> its changelog heading, exactly", (id, version, heading, notHeadings) => {
    const s = sourceOf(id);
    if (s.kind !== "changelog-file") throw new Error(`${id}: ${s.kind}`);
    expect(s.heading(version).test(`intro\n\n${heading}\n\nnotes`)).toBe(true);
    for (const other of notHeadings) expect(s.heading(version).test(`x\n${other}\n`), other).toBe(false);
  });

  it("web pages only: amp, cursor, vercel link to the page; kiro to the minor version's page", () => {
    for (const [id, url] of [
      ["amp", "https://ampcode.com/news"],
      ["cursor", "https://cursor.com/docs/cli/changelog"],
      ["vercel", "https://vercel.com/changelog"],
    ] as const) {
      expect(sourceOf(id)).toMatchObject({ kind: "link-only", url });
    }
    expect(notesLink(sourceOf("kiro"), "2.34.0")).toBe("https://kiro.dev/changelog/cli/2-34/");
  });

  it("an unknown latest version links to every release", () => {
    expect(notesLink(sourceOf("gh"), null)).toBe("https://github.com/cli/cli/releases");
  });
});

/** A fake fetch: answers by URL, records each request. */
function fakeFetch(answer: (url: string, init: Parameters<FetchText>[1]) => TextResult) {
  const calls: { url: string; init: Parameters<FetchText>[1] }[] = [];
  const fetchText: FetchText = async (url, init) => {
    calls.push({ url, init });
    return answer(url, init);
  };
  return { fetchText, calls };
}

const ok = (text: string, status = 200, capped = false): TextResult => ({ ok: true, status, text, capped });
const httpError = (status: number, rateLimit?: { resetAt: number | null }): TextResult => ({ ok: false, status, failure: { kind: "http", detail: `HTTP ${status}`, ...(rateLimit && { rateLimit }) } });
const release = (body: unknown) => ok(JSON.stringify({ tag_name: "x", html_url: "https://evil.example/notes", body, assets: [] }));

const codex = (version: string | null = "0.164.0", installed: string | null = "0.163.0"): NotesTarget => ({ id: "codex", name: "Codex CLI", version, installed, source: sourceOf("codex") });
const wrangler = (version = "4.152.0"): NotesTarget => ({ id: "wrangler", name: "Wrangler", version, source: sourceOf("wrangler") });

const WRANGLER_CHANGELOG = [
  "# wrangler",
  "",
  "## 4.152.0",
  "",
  "### Minor Changes",
  "",
  "- [#14900](https://github.com/cloudflare/workers-sdk/pull/14900) New `wrangler deploy --tag` flag",
  "",
  "## 4.151.3",
  "",
  "### Patch Changes",
  "",
  "- Older fix that must never be shown for 4.152.0",
  "",
].join("\n");

describe("loadNotes: GitHub releases", () => {
  it("one request for exactly the Latest tag, with the token; the link is the registry's, never the API's html_url", async () => {
    const f = fakeFetch(() => release("## Highlights\n\n- New `codex exec` flag"));
    const notes = await loadNotes(codex(), { fetchText: f.fetchText, env: { GITHUB_TOKEN: "ghs_secret" } });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe("https://api.github.com/repos/openai/codex/releases/tags/rust-v0.164.0");
    expect(f.calls[0]!.init.headers).toMatchObject({ accept: "application/vnd.github+json", authorization: "Bearer ghs_secret" });
    expect(f.calls[0]!.init.maxBytes).toBe(RELEASE_JSON_CAP);
    expect(notes).toMatchObject({ state: "ready", tool: "Codex CLI", version: "0.164.0", installed: "0.163.0", link: "https://github.com/openai/codex/releases/tag/rust-v0.164.0", from: "network" });
    expect(notes.notes).toContain("New `codex exec` flag");
    expect(JSON.stringify(notes)).not.toContain("evil.example");
  });

  it("404 (no release for that tag): 'No release notes for <version>', no other request (never older notes)", async () => {
    const f = fakeFetch(() => httpError(404));
    const notes = await loadNotes(codex(), { fetchText: f.fetchText, env: {} });
    expect(f.calls).toHaveLength(1);
    expect(notes.state).toBe("none");
    expect(bodyLines(notes, 60, true).join("\n")).toContain("No release notes for 0.164.0.");
    expect(bodyLines(notes, 60, true).join("\n")).toContain("https://github.com/openai/codex/releases/tag/rust-v0.164.0");
  });

  it("an empty body is 'no notes' too", async () => {
    for (const body of ["", "  \n", null]) {
      expect((await loadNotes(codex(), { fetchText: fakeFetch(() => release(body)).fetchText, env: {} })).state).toBe("none");
    }
  });

  it("rate limited: the message says when to try again, advises a token only when none is set, and never shows it", async () => {
    const limited = fakeFetch(() => httpError(403, { resetAt: null }));
    const without = await loadNotes(codex(), { fetchText: limited.fetchText, env: {} });
    expect(without).toMatchObject({ state: "error", error: "GitHub rate limit reached. Try again later, or set GITHUB_TOKEN.", rateLimit: { resetAt: null } });
    expect(limited.calls).toHaveLength(1);
    const withToken = await loadNotes(codex(), { fetchText: limited.fetchText, env: { GH_TOKEN: "ghp_secret" } });
    expect(withToken.error).toBe("GitHub rate limit reached. Try again later.");
    // A rate limit is never retried without the token (that would only use up the smaller limit).
    expect(limited.calls).toHaveLength(2);
    expect(JSON.stringify(withToken)).not.toContain("ghp_secret");
  });

  it("a 403 that isn't a rate limit, with a token (an org's IP allow list refuses app tokens): retried once without it", async () => {
    const f = fakeFetch((_url, init) => (init.headers?.authorization ? httpError(403) : release("- Vibe notes")));
    const notes = await loadNotes(codex(), { fetchText: f.fetchText, env: { GITHUB_TOKEN: "ghs_app" } });
    expect(notes).toMatchObject({ state: "ready", from: "network" });
    expect(f.calls.map((c) => Boolean(c.init.headers?.authorization))).toEqual([true, false]);
    // Without a token there is nothing to drop: one request, the plain error.
    const anonymous = fakeFetch(() => httpError(403));
    expect(await loadNotes(codex(), { fetchText: anonymous.fetchText, env: {} })).toMatchObject({ state: "error", error: "HTTP 403" });
    expect(anonymous.calls).toHaveLength(1);
  });

  it("long notes are cut at a line break, ending with 'Notes cut here. Full notes: <link>'", async () => {
    const long = Array.from({ length: 3000 }, (_, i) => `- change number ${i} with some words to make it long`).join("\n");
    expect(long.length).toBeGreaterThan(NOTES_RENDER_CAP);
    const notes = await loadNotes(codex(), { fetchText: fakeFetch(() => release(long)).fetchText, env: {} });
    expect(notes.truncated).toBe(true);
    expect(notes.notes!.length).toBeLessThanOrEqual(NOTES_RENDER_CAP);
    expect(notes.notes!.endsWith("long")).toBe(true);
    const lines = bodyLines(notes, 80, true).map((l) => stripVTControlCharacters(l));
    expect(lines.at(-1)).toBe("Notes cut here. Full notes: https://github.com/openai/codex/releases/tag/rust-v0.164.0");
  });

  it("an answer over the JSON cap: an error with the link, nothing half-parsed", async () => {
    const notes = await loadNotes(codex(), { fetchText: fakeFetch(() => ok('{"body":"cut', 200, true)).fetchText, env: {} });
    expect(notes).toMatchObject({ state: "error", link: "https://github.com/openai/codex/releases/tag/rust-v0.164.0" });
  });

  it("hostile notes come back sanitized (and the popup never draws an escape sequence)", async () => {
    const hostile = `${ESC}]0;pwned${ESC}\\Fix${ESC}[2J ${ESC}]8;;https://evil.example${ESC}\\link${ESC}]8;;${ESC}\\ ‮evil\u0007`;
    const notes = await loadNotes(codex(), { fetchText: fakeFetch(() => release(hostile)).fetchText, env: {} });
    expect(notes.notes).toBe("Fix link evil");
    const screen = renderPopup(notes, { cols: 80, rows: 24, ascii: false, scroll: 0 }).lines.join("\n");
    expect(stripVTControlCharacters(screen)).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/);
  });

  it("an up-to-date tool shows its current version's notes, without the 'You're on' line", async () => {
    const notes = await loadNotes(codex("0.164.0", "0.164.0"), { fetchText: fakeFetch(() => release("- x")).fetchText, env: {} });
    expect(notes.state).toBe("ready");
    expect(notes.installed).toBeUndefined();
  });

  it("no request when the latest version isn't known, or for a web page", async () => {
    const f = fakeFetch(() => release("x"));
    expect(await loadNotes(codex(null), { fetchText: f.fetchText })).toMatchObject({ state: "none", version: "", link: "https://github.com/openai/codex/releases" });
    const amp = await loadNotes({ id: "amp", name: "Amp", version: "0.0.1", source: sourceOf("amp") }, { fetchText: f.fetchText });
    expect(amp).toMatchObject({ state: "link-only", link: "https://ampcode.com/news" });
    expect(stripVTControlCharacters(bodyLines(amp, 60, true).join("\n"))).toContain("o opens them in your browser");
    expect(f.calls).toHaveLength(0);
  });
});

describe("loadNotes: changelog files (Range, cap, cut)", () => {
  it("asks for the first part only (Range) and cuts out exactly the version's section", async () => {
    const f = fakeFetch(() => ok(WRANGLER_CHANGELOG, 206));
    const notes = await loadNotes(wrangler(), { fetchText: f.fetchText, env: {} });
    expect(f.calls[0]!.url).toBe("https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/CHANGELOG.md");
    expect(f.calls[0]!.init.headers).toMatchObject({ range: "bytes=0-131071" });
    expect(f.calls[0]!.init.headers).not.toHaveProperty("authorization");
    expect(notes.state).toBe("ready");
    expect(notes.notes).toContain("wrangler deploy --tag");
    expect(notes.notes).not.toContain("Older fix");
    expect(notes.truncated).toBeUndefined();
    expect(notes.link).toBe("https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/CHANGELOG.md");
  });

  it("the section runs past the part that was read: shown, marked as cut", async () => {
    const partial = `## 4.152.0\n\n- first change\n- second change\n- third chan`;
    const notes = await loadNotes(wrangler(), { fetchText: fakeFetch(() => ok(partial, 206)).fetchText, env: {} });
    expect(notes).toMatchObject({ state: "ready", truncated: true });
    expect(notes.notes).toBe("- first change\n- second change");
  });

  it("the version isn't in the file (only older ones): 'No release notes', never the older section", async () => {
    const notes = await loadNotes(wrangler("4.153.0"), { fetchText: fakeFetch(() => ok(WRANGLER_CHANGELOG, 206)).fetchText, env: {} });
    expect(notes.state).toBe("none");
    expect(notes.notes).toBeUndefined();
  });

  it("a server that ignores Range: the download stops at the cap; not found there = give up with the link", async () => {
    const f = fakeFetch((_url, init) => ok("x".repeat(init.maxBytes), 200, true));
    const notes = await loadNotes(wrangler(), { fetchText: f.fetchText, env: {} });
    expect(f.calls[0]!.init.maxBytes).toBe(NOTES_DOWNLOAD_CAP);
    expect(notes).toMatchObject({ state: "error", error: "the notes file is too large to read here" });
    // Found within the cap: shown as usual.
    const found = await loadNotes(wrangler(), { fetchText: fakeFetch(() => ok(WRANGLER_CHANGELOG, 200, true)).fetchText, env: {} });
    expect(found.state).toBe("ready");
  });

  it("gcloud: '## <version> (<date>)', subsections kept, hard-wrapped bullets joined", async () => {
    const text = "# Google Cloud CLI - Release Notes\n\n## 590.0.1 (2026-10-22)\n\n### Google Cloud CLI\n\n*   Updated bundled `certifi` and removed distrusted CA root\n    certificates from bundled certificate stores.\n\n## 590.0.0 (2026-10-15)\n\n*   old\n";
    const notes = await loadNotes({ id: "gcloud", name: "Google Cloud CLI", version: "590.0.1", source: sourceOf("gcloud", "native") }, { fetchText: fakeFetch(() => ok(text, 206)).fetchText, env: {} });
    expect(notes.notes).not.toContain("old");
    const lines = bodyLines(notes, 80, true).map((l) => stripVTControlCharacters(l));
    expect(lines).toContain("Google Cloud CLI");
    expect(lines.join("\n")).toContain("- Updated bundled certifi and removed distrusted CA root certificates from\n  bundled certificate stores.");
  });

  it("changelogSection: ends at a heading of the same or a higher level only", () => {
    const s = changelogSection("## 2.0\n### Sub\n- a\n#### deeper\n- b\n# Top\n", /^## 2\.0$/m);
    expect(s).toEqual({ body: "### Sub\n- a\n#### deeper\n- b", complete: true });
  });
});

describe("notes cache: by tool + version, 7 days, size cap, offline", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tempCache = (now: () => number, maxBytes?: number) => {
    const dir = join(mkdtempSync(join(tmpdir(), "ccl-caut-notes-")), "whats-new");
    dirs.push(join(dir, ".."));
    return new NotesCache(dir, now, maxBytes, process.platform);
  };

  it("a second press is served from the cache, until the 7 days are up", async () => {
    let now = 1_000_000;
    const cache = tempCache(() => now);
    const f = fakeFetch(() => release("- cached"));
    expect((await loadNotes(codex(), { fetchText: f.fetchText, cache, env: {} })).from).toBe("network");
    expect((await loadNotes(codex(), { fetchText: f.fetchText, cache, env: {} })).from).toBe("cache");
    expect(f.calls).toHaveLength(1);
    now += NOTES_TTL_MS + 1;
    expect((await loadNotes(codex(), { fetchText: f.fetchText, cache, env: {} })).from).toBe("network");
    expect(f.calls).toHaveLength(2);
  });

  it("'no notes' is kept 1 hour only (a vendor may still publish them)", async () => {
    let now = 1_000_000;
    const cache = tempCache(() => now);
    const f = fakeFetch(() => httpError(404));
    await loadNotes(codex(), { fetchText: f.fetchText, cache, env: {} });
    await loadNotes(codex(), { fetchText: f.fetchText, cache, env: {} });
    expect(f.calls).toHaveLength(1);
    now += NO_NOTES_TTL_MS + 1;
    await loadNotes(codex(), { fetchText: f.fetchText, cache, env: {} });
    expect(f.calls).toHaveLength(2);
  });

  it("offline: cached notes (even expired) are shown; without them, the error state with the link", async () => {
    let now = 1_000_000;
    const cache = tempCache(() => now);
    await loadNotes(codex(), { fetchText: fakeFetch(() => release("- from before")).fetchText, cache, env: {} });
    now += NOTES_TTL_MS * 2;
    const offline = fakeFetch(() => ({ ok: false, failure: { kind: "offline", detail: "ENETUNREACH" } }));
    expect(await loadNotes(codex(), { fetchText: offline.fetchText, cache, env: {} })).toMatchObject({ state: "ready", notes: "- from before", from: "stale-cache" });
    const other = await loadNotes(codex("0.165.0"), { fetchText: offline.fetchText, cache, env: {} });
    expect(other).toMatchObject({ state: "error", error: "no network connection (ENETUNREACH)", link: "https://github.com/openai/codex/releases/tag/rust-v0.165.0" });
  });

  it("different versions and different sources (Kimi's two repos) never share an entry", async () => {
    const cache = tempCache(() => 1);
    const f = fakeFetch((url) => release(`- ${url}`));
    const kimiNpm: NotesTarget = { id: "kimi", name: "Kimi", version: "1.0.0", source: sourceOf("kimi", "npm") };
    const kimiPy: NotesTarget = { ...kimiNpm, source: sourceOf("kimi", "uv") };
    await loadNotes(kimiNpm, { fetchText: f.fetchText, cache, env: {} });
    expect((await loadNotes(kimiPy, { fetchText: f.fetchText, cache, env: {} })).notes).toContain("kimi-cli");
    expect(f.calls).toHaveLength(2);
  });

  it("cached text is sanitized again when read (a tampered cache file can't inject sequences)", async () => {
    const cache = tempCache(() => 1);
    await loadNotes(codex(), { fetchText: fakeFetch(() => release("- ok")).fetchText, cache, env: {} });
    const dir = cache.location!;
    const [file] = readdirSync(dir);
    const entry = JSON.parse(readFileSync(join(dir, file!), "utf8"));
    writeFileSync(join(dir, file!), JSON.stringify({ ...entry, notes: `- ok${ESC}]0;pwned\u0007${ESC}[2J` }));
    expect((await loadNotes(codex(), { fetchText: fakeFetch(() => release("x")).fetchText, cache, env: {} })).notes).toBe("- ok");
  });

  it("the folder stays under its size cap: expired files go first, then the oldest", () => {
    const cache = tempCache(() => Date.now(), 2_500);
    mkdirSync(cache.location!, { recursive: true });
    const old = (name: string, ageMs: number) => {
      const p = join(cache.location!, name);
      writeFileSync(p, "x".repeat(1000));
      const t = (Date.now() - ageMs) / 1000;
      utimesSync(p, t, t);
    };
    old("expired.json", NOTES_TTL_MS + 60_000);
    old("oldest.json", 3_000_000);
    old("older.json", 2_000_000);
    cache.set("k", { state: "ready", notes: "x".repeat(900) });
    const left = readdirSync(cache.location!).sort();
    expect(left).not.toContain("expired.json");
    expect(left).not.toContain("oldest.json");
    expect(left).toContain("older.json");
    expect(left).toHaveLength(2);
  });
});

describe("Network.fetchText (undici keep-alive pool, proxy, timeouts)", () => {
  const net = (impl: FetchImpl) => new Network({ fetch: impl, dispatcher: () => undefined, warmUpUrl: null });
  const stream = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.shift();
        if (next === undefined) controller.close();
        else controller.enqueue(new TextEncoder().encode(next));
      },
    });

  it("stops downloading at the byte cap and says so", async () => {
    const cancel = vi.fn();
    const body = stream(["a".repeat(600), "b".repeat(600), "c".repeat(600)]);
    const original = body.getReader.bind(body);
    body.getReader = (() => {
      const reader = original();
      const orig = reader.cancel.bind(reader);
      reader.cancel = (reason?: unknown) => {
        cancel();
        return orig(reason);
      };
      return reader;
    }) as typeof body.getReader;
    const result = await net(async () => ({ ok: true, status: 200, json: async () => null, body })).fetchText("https://example.test/f", { maxBytes: 1000 });
    expect(result).toMatchObject({ ok: true, status: 200, capped: true });
    expect(result.ok && result.text.length).toBe(1000);
    expect(cancel).toHaveBeenCalled();
  });

  it("passes 206 and the Range header through; 404 keeps its status", async () => {
    const seen: Record<string, string>[] = [];
    const partial = await net(async (_u, init) => {
      seen.push(init.headers);
      return { ok: true, status: 206, json: async () => null, text: async () => "## 1.0" };
    }).fetchText("https://example.test/f", { maxBytes: 10, headers: { range: "bytes=0-9" } });
    expect(partial).toEqual({ ok: true, status: 206, text: "## 1.0", capped: false });
    expect(seen[0]).toMatchObject({ range: "bytes=0-9" });
    const missing = await net(async () => ({ ok: false, status: 404, json: async () => null })).fetchText("https://example.test/f", { maxBytes: 10 });
    expect(missing).toMatchObject({ ok: false, status: 404 });
  });

  it("q while fetching aborts the request", async () => {
    const abort = new AbortController();
    const pending = net((_u, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))).fetchText("https://example.test/f", { maxBytes: 10, signal: abort.signal });
    abort.abort();
    expect((await pending).ok).toBe(false);
  });
});

describe("GitHub refusals, from recorded answers (headers as GitHub sends them)", () => {
  // Epoch seconds as in x-ratelimit-reset; 1792862088 = the reset in the recorded CI answer.
  const RESET = 1792862088;
  const NOW = (RESET - 600) * 1000;
  const answer = (status: number, headers: Record<string, string>, body: string) =>
    new Network({
      fetch: async () => ({ ok: false, status, headers: new Headers(headers), json: async () => JSON.parse(body), text: async () => body }),
      dispatcher: () => undefined,
      warmUpUrl: null,
      now: () => NOW,
    });
  const PRIMARY = { "x-ratelimit-limit": "60", "x-ratelimit-remaining": "0", "x-ratelimit-used": "60", "x-ratelimit-resource": "core", "x-ratelimit-reset": String(RESET) };
  const PRIMARY_BODY = JSON.stringify({ message: "API rate limit exceeded for 203.0.113.7. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)", documentation_url: "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting" });
  const SECONDARY = { "retry-after": "60", "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4890", "x-ratelimit-resource": "core", "x-ratelimit-reset": String(RESET) };
  const SECONDARY_BODY = JSON.stringify({ message: "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.", documentation_url: "https://docs.github.com/rest/overview/rate-limits-for-the-rest-api#about-secondary-rate-limits" });
  // Recorded in the canary (run 40110642514): Actions' GITHUB_TOKEN against mistralai/mistral-vibe.
  const ALLOW_LIST = { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4979", "x-ratelimit-resource": "core", "x-ratelimit-reset": String(RESET), "x-accepted-github-permissions": "contents=read" };
  const ALLOW_LIST_BODY = JSON.stringify({ message: "Although you appear to have the correct authorization credentials, the `mistralai` organization has an IP allow list enabled, and your IP address is not permitted to access this resource.", documentation_url: "https://docs.github.com/rest/releases/releases#get-a-release-by-tag-name", status: "403" });
  const at = (ms: number) => new Date(ms).toTimeString().slice(0, 5);

  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tempCache = () => {
    const dir = join(mkdtempSync(join(tmpdir(), "ccl-caut-notes-")), "whats-new");
    dirs.push(join(dir, ".."));
    return { dir, cache: new NotesCache(dir, () => NOW, undefined, process.platform) };
  };

  it("primary limit (403, x-ratelimit-remaining: 0): 'Try again after <reset, local time>, or set GITHUB_TOKEN', with the link", async () => {
    const net = answer(403, PRIMARY, PRIMARY_BODY);
    const notes = await loadNotes(codex(), { fetchText: (url, init) => net.fetchText(url, init), env: {} });
    expect(notes).toMatchObject({ state: "error", rateLimit: { resetAt: RESET * 1000 } });
    expect(notes.error).toBe(`GitHub rate limit reached. Try again after ${at(RESET * 1000)}, or set GITHUB_TOKEN.`);
    const body = stripVTControlCharacters(bodyLines(notes, 80, true).join("\n"));
    expect(body).toContain(`GitHub rate limit reached. Try again after ${at(RESET * 1000)}, or set GITHUB_TOKEN.`);
    expect(body).not.toContain("Couldn't load");
    expect(body).toContain("https://github.com/openai/codex/releases/tag/rust-v0.164.0");
  });

  it("secondary limit (403 + retry-after) and 429 are rate limits too", async () => {
    const secondary = answer(403, SECONDARY, SECONDARY_BODY);
    expect((await loadNotes(codex(), { fetchText: (u, i) => secondary.fetchText(u, i), env: { GITHUB_TOKEN: "ghs_x" } })).error).toBe(`GitHub rate limit reached. Try again after ${at(RESET * 1000)}.`);
    const tooMany = answer(429, { "retry-after": "120" }, "{}");
    const notes = await loadNotes(codex(), { fetchText: (u, i) => tooMany.fetchText(u, i), env: {} });
    expect(notes).toMatchObject({ rateLimit: { resetAt: NOW + 120_000 } });
    expect(notes.error).toBe(`GitHub rate limit reached. Try again after ${at(NOW + 120_000)}, or set GITHUB_TOKEN.`);
  });

  it("a rate limit is not cached as 'no notes': the next press asks GitHub again", async () => {
    const { dir, cache } = tempCache();
    let calls = 0;
    const net = answer(403, PRIMARY, PRIMARY_BODY);
    const fetchText: FetchText = (u, i) => {
      calls++;
      return net.fetchText(u, i);
    };
    expect((await loadNotes(codex(), { fetchText, cache, env: {} })).state).toBe("error");
    expect(existsSync(dir) ? readdirSync(dir) : []).toHaveLength(0);
    await loadNotes(codex(), { fetchText, cache, env: {} });
    expect(calls).toBe(2);
  });

  it("the IP allow list refusal (403, quota left) is not a rate limit", async () => {
    const net = answer(403, ALLOW_LIST, ALLOW_LIST_BODY);
    const result = await net.fetchText("https://api.github.com/repos/mistralai/mistral-vibe/releases/tags/v3.0.2", { maxBytes: 100 });
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(!result.ok && result.failure.rateLimit).toBeFalsy();
  });
});

function keys(...sequence: string[]) {
  const input = new PassThrough();
  let drawn = "";
  const output = new Writable({
    write: (chunk, _e, cb) => {
      drawn += String(chunk);
      cb();
    },
  });
  setTimeout(async () => {
    for (const k of sequence) {
      input.write(k);
      await new Promise((r) => setTimeout(r, 15));
    }
  }, 20);
  return { input, output, drawn: () => stripVTControlCharacters(drawn) };
}

const OPTIONS = [
  { value: "ccl-caut", label: "CCL CAUT  1.2.0 -> 1.2.1", group: "CCL CAUT" },
  { value: "codex", label: "Codex CLI  0.163.0 -> 0.164.0", group: "AI agents" },
];

describe("the n key", () => {
  it("checklist: n opens the highlighted row's notes (CCL CAUT's own row too); the hint says so", async () => {
    const shown: string[] = [];
    const notes = { show: async (v: string) => void shown.push(v), open: vi.fn(), fits: () => true, hint: true };
    const k = keys("n", "\x1b[B", "n", "q");
    expect(await checklist({ message: "Select", options: OPTIONS, initialValues: [], notes, ...k })).toBe(QUIT);
    expect(shown).toEqual(["ccl-caut", "codex"]);
    expect(k.drawn()).toContain("a all · n what's new · enter confirm · q quit");
  });

  it("checklist, --hide-whats-new: no hint, n still works", async () => {
    const show = vi.fn(async () => {});
    const k = keys("n", "q");
    await checklist({ message: "Select", options: OPTIONS, initialValues: [], notes: { show, open: vi.fn(), fits: () => true, hint: false }, ...k });
    expect(show).toHaveBeenCalledWith("ccl-caut");
    expect(k.drawn()).not.toContain("what's new");
  });

  it("checklist, window too small: one line in the hint area, o opens the browser, nothing printed into the prompt", async () => {
    const show = vi.fn(async () => {});
    const open = vi.fn();
    const k = keys("\x1b[B", "n", "o", "q");
    expect(await checklist({ message: "Select", options: OPTIONS, initialValues: [], notes: { show, open, fits: () => false, hint: true }, ...k })).toBe(QUIT);
    expect(show).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith("codex");
    expect(k.drawn()).toContain(NOTES_TOO_SMALL);
    expect(k.drawn()).not.toContain("What's new in");
  });

  it('"What next?": n resolves NOTES, with "n what\'s new" in the hints (or not, when hidden)', async () => {
    const options = [{ value: "rescan", label: "Rescan" }, { value: "quit", label: "Quit" }];
    const k = keys("n");
    expect(await choose({ message: "What next?", options, initialValue: "quit", rescan: true, notes: true, ...k })).toBe(NOTES);
    expect(k.drawn()).toContain("enter confirm · n what's new · r rescan · q quit");
    const hidden = keys("n");
    expect(await choose({ message: "What next?", options, initialValue: "quit", notes: true, notesHint: false, ...hidden })).toBe(NOTES);
    expect(hidden.drawn()).not.toContain("n what's new");
    // Not offered: n does nothing.
    const off = keys("n", "q");
    expect(await choose({ message: "What next?", options, initialValue: "quit", ...off })).toBe(QUIT);
  });

  it('"What next?" offers the tools just updated, and nothing after a CCL CAUT self-update', () => {
    const row = (id: string) => ({ id }) as ToolScan;
    const offered = [row("ccl-caut"), row("codex"), row("gh"), row("claude")];
    expect(rowsForWhatsNew(offered, ["codex", "gh"], false).map((r) => r.id)).toEqual(["codex", "gh"]);
    expect(rowsForWhatsNew(offered, ["codex", "ccl-caut"], true)).toEqual([]);
    expect(rowsForWhatsNew(offered, [], false)).toEqual([]);
  });
});

describe("popup glyphs come from symbols.ts", () => {
  it("frame, arrows, bullets and ellipsis follow the terminal (no Unicode in ASCII mode)", () => {
    const content = { tool: "T", version: "1", state: "ready" as const, notes: "- item\n\n> quote\n\n---\n\n[x](https://example.com/a/very/long/path/that/needs/to/be/cut/somewhere)", link: "https://example.com" };
    const ascii = renderPopup(content, { cols: 80, rows: 20, ascii: true, scroll: 0 }).lines.map((l) => stripVTControlCharacters(l)).join("\n");
    expect(ascii).not.toMatch(/[^\u0000-\u007f·]/);
    const g = iconSet(true);
    const unicode = renderPopup(content, { cols: 80, rows: 20, ascii: false, scroll: 0 }).lines.map((l) => stripVTControlCharacters(l)).join("\n");
    for (const glyph of [g.bullet, g.upDown, g.ellipsis, "╔", "║"]) expect(unicode).toContain(glyph);
    expect(inlineNotes(content, 80)).not.toMatch(/[^\u0000-\u007f·]/);
  });
});

describe("closing the popup hands stdin back cleanly", () => {
  it("q: raw mode and pause are restored after the key's data callback, before the next prompt (Windows EPIPE)", async () => {
    const calls: string[] = [];
    const input = Object.assign(new PassThrough(), {
      isTTY: true,
      isRaw: false,
      setRawMode: (mode: boolean) => calls.push(`raw ${mode}`),
    });
    const pause = input.pause.bind(input);
    input.pause = () => {
      calls.push("pause");
      return pause();
    };
    input.pause();
    calls.length = 0;
    const output = Object.assign(new PassThrough(), { isTTY: true, columns: 100, rows: 30 }) as unknown as NodeJS.WriteStream;
    const content = { tool: "Codex CLI", version: "0.164.0", state: "ready" as const, notes: "- one", link: "https://x.test" };
    let closed = false;
    const done = showNotes(content, { input, output, ascii: true }).then((r) => {
      closed = true;
      return r;
    });
    input.on("data", (d) => {
      // Inside the data callback of q: stdin is still raw and flowing.
      if (String(d) === "q") calls.push("data q");
    });
    input.write("q");
    expect(await done).toBe("shown");
    expect(closed).toBe(true);
    expect(calls).toEqual(["raw true", "data q", "raw false", "pause"]);
  });
});
