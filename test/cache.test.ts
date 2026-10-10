import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CACHE_TTL_MS, cacheDir, VersionCache } from "../src/utils/cache";
import { getHost, type Host } from "../src/utils/host";
import { fakeHost, win } from "./helpers";

describe("cacheDir", () => {
  it("uses the OS cache location", () => {
    expect(cacheDir(fakeHost({ platform: "win32", homedir: win("C:/Users/Jane"), env: { LOCALAPPDATA: win("C:/Users/Jane/AppData/Local") } }))).toBe(
      win("C:/Users/Jane/AppData/Local/ccl-caut"),
    );
    expect(cacheDir(fakeHost({ platform: "win32", homedir: win("C:/Users/Jane") }))).toBe(win("C:/Users/Jane/AppData/Local/ccl-caut"));
    expect(cacheDir(fakeHost({ platform: "darwin", homedir: "/Users/jane" }))).toBe("/Users/jane/Library/Caches/ccl-caut");
    expect(cacheDir(fakeHost({ platform: "linux", homedir: "/home/jane", env: { XDG_CACHE_HOME: "/tmp/xdg" } }))).toBe("/tmp/xdg/ccl-caut");
    expect(cacheDir(fakeHost({ platform: "linux", homedir: "/home/jane" }))).toBe("/home/jane/.cache/ccl-caut");
    expect(cacheDir(fakeHost({ platform: "linux", homedir: "" }))).toBeNull();
  });
});

describe("VersionCache on disk", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** Real filesystem, cache directory redirected into a temp dir on every OS. */
  function tempHost(): { host: Host; file: string } {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ccl-caut-test-"));
    dirs.push(dir);
    const host: Host = { ...getHost(), homedir: dir, env: { LOCALAPPDATA: dir, XDG_CACHE_HOME: dir } };
    return { host, file: path.join(cacheDir(host)!, "latest-versions.json") };
  }

  it("round-trips entries and expires them after the TTL", () => {
    const { host } = tempHost();
    let now = 5_000;
    const cache = VersionCache.load(host, () => now);
    cache.set("codex:default", "0.162.1");
    cache.save(host);

    const reloaded = VersionCache.load(host, () => now);
    expect(reloaded.get("codex:default")).toEqual({ version: "0.162.1", fetchedAt: 5_000 });
    now += CACHE_TTL_MS - 1;
    expect(reloaded.get("codex:default")).not.toBeNull();
    now += 1;
    expect(reloaded.get("codex:default")).toBeNull();
  });

  it("drops every channel of a tool", () => {
    const { host } = tempHost();
    const cache = VersionCache.load(host);
    cache.set("kimi:npm", "2.1.1");
    cache.set("kimi:pypi", "1.52.0");
    cache.set("codex:default", "0.162.1");
    cache.dropTool("kimi");
    expect(cache.get("kimi:npm")).toBeNull();
    expect(cache.get("kimi:pypi")).toBeNull();
    expect(cache.get("codex:default")).not.toBeNull();
  });

  it.each([
    ["corrupt JSON", "{ not json"],
    ["unexpected schema", JSON.stringify({ schema: 99, entries: {} })],
    ["entries is not an object", JSON.stringify({ schema: 1, entries: "x" })],
  ])("ignores a cache file with %s", (_label, content) => {
    const { host, file } = tempHost();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    expect(() => VersionCache.load(host)).not.toThrow();
    expect(VersionCache.load(host).get("codex:default")).toBeNull();
  });

  it("skips malformed entries but keeps valid ones", () => {
    const { host, file } = tempHost();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ schema: 1, entries: { "a:default": { version: "1.0.0", fetchedAt: Date.now() }, "b:default": { version: 3 } } }));
    const cache = VersionCache.load(host);
    expect(cache.get("a:default")?.version).toBe("1.0.0");
    expect(cache.get("b:default")).toBeNull();
  });

  it("never throws when the cache cannot be written", () => {
    const { host } = tempHost();
    const blocker = path.join(host.homedir, "not-a-dir");
    writeFileSync(blocker, "");
    const blocked: Host = { ...host, env: { LOCALAPPDATA: blocker, XDG_CACHE_HOME: blocker }, homedir: blocker };
    const cache = VersionCache.load(blocked);
    cache.set("codex:default", "0.162.1");
    expect(() => cache.save(blocked)).not.toThrow();
    expect(readFileSync(blocker, "utf8")).toBe("");
  });
});