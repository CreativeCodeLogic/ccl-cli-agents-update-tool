import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { doctorReport, type DoctorDeps } from "../src/doctor";
import { gh } from "../src/registry/gh";
import { goose } from "../src/registry/goose";
import { LatestResolver } from "../src/scan";
import { CACHE_TTL_MS, VersionCache } from "../src/utils/cache";
import {
  defaultTagVersion,
  fetchLatestGithubRelease,
  GITHUB_CACHE_TTL_MS,
  githubRateLimit,
  githubRateLimitNotice,
  githubTokenSource,
  resetGithubState,
} from "../src/utils/github";
import { getHost, type Host } from "../src/utils/host";
import { getNetwork, rateLimitOf } from "../src/utils/http";
import { useFakeFetch } from "./helpers";

const TOKEN = "ghp_SECRETtokenVALUE1234567890";
const restores: (() => void)[] = [];
beforeEach(() => resetGithubState());
afterEach(() => {
  for (const r of restores.splice(0)) r();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** GitHub's rate-limit answer: 403 with x-ratelimit-remaining 0 and a reset time. */
const rateLimited = (resetEpochS = 1_900_000_000) =>
  new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
    status: 403,
    headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(resetEpochS) },
  });

function tempCache(now: () => number): { cache: VersionCache; cleanup: () => void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccl-caut-gh-"));
  const host: Host = { ...getHost(), homedir: dir, env: { LOCALAPPDATA: dir, XDG_CACHE_HOME: dir } };
  return { cache: VersionCache.load(host, now), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Capture everything written to stdout and stderr while `fn` runs. */
async function captureOutput(fn: () => Promise<unknown>): Promise<string> {
  let out = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => ((out += String(chunk)), true));
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => ((out += String(chunk)), true));
  await fn();
  return out;
}

describe("GitHub releases lookup", () => {
  it("turns release tags into versions", () => {
    expect(defaultTagVersion("v2.102.0")).toBe("2.102.0");
    expect(defaultTagVersion("1.54.0")).toBe("1.54.0");
    expect(defaultTagVersion("stable")).toBeNull();
  });

  it("asks GitHub once per repository per run", async () => {
    const fetch = vi.fn(async (_url: string) => Response.json({ tag_name: "v2.102.0" }));
    restores.push(useFakeFetch(fetch));
    expect(await fetchLatestGithubRelease("cli/cli")).toBe("2.102.0");
    expect(await gh.getLatestVersion()).toBe("2.102.0");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe("https://api.github.com/repos/cli/cli/releases/latest");
  });

  it("caches GitHub-sourced versions for 6 hours (npm and PyPI: 1 hour)", () => {
    expect(GITHUB_CACHE_TTL_MS).toBe(6 * CACHE_TTL_MS);
    for (const tool of [gh, goose]) expect(tool.latestCacheTtlMs).toBe(GITHUB_CACHE_TTL_MS);
    let now = 0;
    const { cache, cleanup } = tempCache(() => now);
    restores.push(cleanup);
    cache.set("gh:default", "2.100.0");
    now = 3 * 3600_000;
    expect(cache.get("gh:default")).toBeNull(); // past the default hour
    expect(cache.get("gh:default", GITHUB_CACHE_TTL_MS)?.version).toBe("2.100.0");
  });
});

describe("GitHub token", () => {
  it("uses GITHUB_TOKEN, else GH_TOKEN, else none", () => {
    expect(githubTokenSource({ GITHUB_TOKEN: "a", GH_TOKEN: "b" })).toBe("GITHUB_TOKEN");
    expect(githubTokenSource({ GH_TOKEN: "b" })).toBe("GH_TOKEN");
    expect(githubTokenSource({ GITHUB_TOKEN: "  " })).toBeNull();
    expect(githubTokenSource({})).toBeNull();
  });

  it("sends it as a bearer token to api.github.com only when set", async () => {
    const fetch = vi.fn(async (_url: string, _init: { headers: Record<string, string> }) => Response.json({ tag_name: "v1.54.0" }));
    restores.push(useFakeFetch(fetch));
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GH_TOKEN", "");
    await fetchLatestGithubRelease("aaif-goose/goose");
    expect(fetch.mock.calls[0]![1].headers.authorization).toBeUndefined();

    getNetwork().reset();
    vi.stubEnv("GH_TOKEN", TOKEN);
    await fetchLatestGithubRelease("aaif-goose/goose");
    expect(fetch.mock.calls[1]![1].headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("never appears in debug output, --doctor or the network report", async () => {
    vi.stubEnv("GITHUB_TOKEN", TOKEN);
    vi.stubEnv("CCL_CAUT_DEBUG", "1");
    restores.push(useFakeFetch(async () => rateLimited()));
    const deps: DoctorDeps = {
      resolve: async () => ({ address: "203.0.113.7" }),
      head: async () => ({ status: 200 }),
      now: () => 0,
      env: { GITHUB_TOKEN: TOKEN },
    };
    let report = "";
    const output = await captureOutput(async () => {
      await fetchLatestGithubRelease("cli/cli");
      report = (await doctorReport("1.1.0-beta.1", deps)).lines.join("\n");
    });
    expect(report).toContain("token  set (GITHUB_TOKEN)");
    for (const text of [output, report, JSON.stringify(getNetwork().report()), githubRateLimitNotice() ?? ""]) {
      expect(text).not.toContain(TOKEN);
      expect(text).not.toContain("SECRET");
    }
  });
});

describe("GitHub rate limits", () => {
  it("recognizes 429, and 403 only with rate-limit headers", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(rateLimitOf(429, h({}), 0)).toEqual({ resetAt: null });
    expect(rateLimitOf(403, h({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1900000000" }), 0)).toEqual({ resetAt: 1_900_000_000_000 });
    expect(rateLimitOf(403, h({ "retry-after": "60" }), 1000)).toEqual({ resetAt: 61_000 });
    expect(rateLimitOf(403, h({}), 0)).toBeNull(); // a plain 403 (e.g. blocked) is not a rate limit
    expect(rateLimitOf(404, h({}), 0)).toBeNull();
  });

  it("with a cached version: falls back to it, says why under CCL_CAUT_DEBUG, one notice per run", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GH_TOKEN", "");
    vi.stubEnv("CCL_CAUT_DEBUG", "1");
    const fetch = vi.fn(async () => rateLimited(1_900_000_000));
    restores.push(useFakeFetch(fetch));
    let now = 1_000_000;
    const { cache, cleanup } = tempCache(() => now);
    restores.push(cleanup);
    cache.set("gh:default", "2.100.0");
    now += 7 * 3600_000; // older than the 6h GitHub TTL

    const resolver = new LatestResolver(cache);
    let version: string | null = null;
    const stderr = await captureOutput(async () => {
      version = await resolver.get(gh);
    });
    expect(version).toBe("2.100.0");
    expect(resolver.stale.get("gh:default")).toBe(1_000_000);
    expect(fetch).toHaveBeenCalledTimes(1); // a rate limit is never retried
    expect(stderr).toContain("GitHub API rate limit reached for cli/cli (HTTP 403; 60 requests/hour without a token)");
    expect(githubRateLimit()).toEqual({ resetAt: 1_900_000_000_000 });
    expect(githubRateLimitNotice(() => new Date(0))).toMatch(/^GitHub rate limit reached; set GITHUB_TOKEN for higher limits \(resets at \d\d:\d\d\)$/);
    expect(githubRateLimitNotice()).toBeNull(); // once per run
  });

  it("without a cached version: the tool stays unknown, with the same notice", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("GH_TOKEN", "");
    restores.push(useFakeFetch(async () => new Response("", { status: 429 })));
    const { cache, cleanup } = tempCache(() => 1_000_000);
    restores.push(cleanup);
    expect(await new LatestResolver(cache).get(gh)).toBeNull();
    expect(githubRateLimitNotice()).toBe("GitHub rate limit reached; set GITHUB_TOKEN for higher limits");
  });

  it("with a token set, the notice doesn't tell you to set one", async () => {
    vi.stubEnv("GITHUB_TOKEN", TOKEN);
    restores.push(useFakeFetch(async () => new Response("", { status: 429 })));
    await fetchLatestGithubRelease("cli/cli");
    expect(githubRateLimitNotice()).toBe("GitHub rate limit reached");
  });
});