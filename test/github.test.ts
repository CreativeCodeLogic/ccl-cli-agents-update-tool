import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gh } from "../src/registry/gh";
import { LatestResolver } from "../src/scan";
import { VersionCache } from "../src/utils/cache";
import { defaultTagVersion, fetchLatestGithubRelease } from "../src/utils/github";
import { getHost, type Host } from "../src/utils/host";
import { useFakeFetch } from "./helpers";

const restores: (() => void)[] = [];
afterEach(() => {
  for (const r of restores.splice(0)) r();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GitHub releases lookup", () => {
  it("turns release tags into versions", () => {
    expect(defaultTagVersion("v2.102.0")).toBe("2.102.0");
    expect(defaultTagVersion("1.54.0")).toBe("1.54.0");
    expect(defaultTagVersion("stable")).toBeNull();
  });

  it("asks GitHub once per repository per run", async () => {
    const fetch = vi.fn(async () => Response.json({ tag_name: "v2.102.0" }));
    restores.push(useFakeFetch(fetch));
    expect(await fetchLatestGithubRelease("cli/cli")).toBe("2.102.0");
    expect(await gh.getLatestVersion()).toBe("2.102.0");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://api.github.com/repos/cli/cli/releases/latest");
  });

  it("on a rate limit (403) says why under CCL_CAUT_DEBUG and falls back to the stale cache", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ message: "API rate limit exceeded" }), { status: 403 }));
    restores.push(useFakeFetch(fetch));
    vi.stubEnv("CCL_CAUT_DEBUG", "1");
    let stderr = "";
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => ((stderr += String(chunk)), true));

    const dir = mkdtempSync(path.join(os.tmpdir(), "ccl-caut-gh-"));
    restores.push(() => rmSync(dir, { recursive: true, force: true }));
    const host: Host = { ...getHost(), homedir: dir, env: { LOCALAPPDATA: dir, XDG_CACHE_HOME: dir } };
    let now = 1_000_000;
    const cache = VersionCache.load(host, () => now);
    cache.set("gh:default", "2.100.0");
    now += 3 * 60 * 60 * 1000; // expired

    const resolver = new LatestResolver(cache);
    expect(await resolver.get(gh)).toBe("2.100.0");
    expect(resolver.stale.get("gh:default")).toBe(1_000_000);
    expect(fetch).toHaveBeenCalledTimes(1); // 403 is not retried
    expect(stderr).toContain("GitHub API rate limit reached for cli/cli (HTTP 403");
  });
});
