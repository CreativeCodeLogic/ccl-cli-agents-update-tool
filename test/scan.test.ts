import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectAll, LatestResolver, prefetchLatest, resolveLatest, summarize } from "../src/scan";
import type { BinaryInstance, ToolDescriptor } from "../src/types";
import { VersionCache } from "../src/utils/cache";
import { primeNpmGlobalPaths } from "../src/utils/npm";
import { fakeHost } from "./helpers";

function fakeTool(overrides: Partial<ToolDescriptor> = {}): ToolDescriptor {
  return {
    id: "tool",
    name: "Tool",
    binNames: ["tool"],
    getInstalledVersion: async (i: BinaryInstance) => (i.path.includes("local") ? "1.0.0" : "2.0.0"),
    getLatestVersion: vi.fn(async () => "2.0.0"),
    getUpdatePlan: async () => ({ kind: "manual", command: "update tool", reason: "test" }),
    ...overrides,
  };
}

/** A cache that never touches the disk (home without a cache file, never saved). */
const emptyCache = (now = () => 1_000_000) => VersionCache.load(fakeHost({ platform: "linux", homedir: "/nonexistent-ccl-caut-test" }), now);

const host = fakeHost({
  platform: "linux",
  homedir: "/home/jane",
  env: { PATH: "/home/jane/.local/bin:/usr/bin" },
  files: ["/home/jane/.local/bin/tool", "/usr/bin/tool"],
});

beforeEach(() => primeNpmGlobalPaths(null));

describe("detectAll + resolveLatest", () => {
  it("treats the first PATH entry as the running copy and the rest as shadowed, in order", async () => {
    const tool = fakeTool();
    const [detection] = await detectAll([tool], host);
    expect(detection?.instances.map((i) => [i.path, i.installMethod, i.version])).toEqual([
      ["/home/jane/.local/bin/tool", "native", "1.0.0"],
      ["/usr/bin/tool", "apt", "2.0.0"],
    ]);

    const [scan] = await resolveLatest([detection!], new LatestResolver());
    expect(scan).toMatchObject({
      installed: true,
      installMethod: "native",
      binaryPath: "/home/jane/.local/bin/tool",
      installedVersion: "1.0.0",
      latestVersion: "2.0.0",
      state: "outdated",
      shadowed: [{ path: "/usr/bin/tool", installMethod: "apt", version: "2.0.0" }],
    });
  });

  it("drops copies the running one delegates to (runsThrough)", async () => {
    const tool = fakeTool({ runsThrough: (_active, other) => other.path === "/usr/bin/tool" });
    const [scan] = await resolveLatest(await detectAll([tool], host), new LatestResolver());
    expect(scan?.shadowed).toEqual([]);
  });

  it("applies the tool's install-method refinement", async () => {
    const tool = fakeTool({ refineInstallMethod: (method) => (method === "apt" ? "snap" : method) });
    const [detection] = await detectAll([tool], host);
    expect(detection?.instances[1]?.installMethod).toBe("snap");
  });

  it("reports missing tools as not installed, without a plan", async () => {
    const tool = fakeTool({ binNames: ["missing"] });
    const [scan] = await resolveLatest(await detectAll([tool], host), new LatestResolver());
    expect(scan).toMatchObject({ installed: false, state: "not-installed", plan: null, shadowed: [] });
  });

  it("survives descriptors that throw", async () => {
    const tool = fakeTool({
      getInstalledVersion: async () => {
        throw new Error("boom");
      },
      getUpdatePlan: async () => {
        throw new Error("boom");
      },
    });
    const [scan] = await resolveLatest(await detectAll([tool], host), new LatestResolver());
    expect(scan).toMatchObject({ installed: true, installedVersion: null, state: "unknown", plan: null });
  });

  it("summarizes states and shadowed tools", async () => {
    const results = await resolveLatest(await detectAll([fakeTool(), fakeTool({ id: "x", binNames: ["nope"] })], host), new LatestResolver());
    expect(summarize(results)).toEqual({ total: 2, upToDate: 0, outdated: 1, notInstalled: 1, unknown: 0, retired: 0, selfUpdating: 0, shadowed: 1 });
  });
});

describe("LatestResolver", () => {
  it("looks each channel up once per run, prefetch included", async () => {
    const tool = fakeTool();
    const latest = new LatestResolver();
    prefetchLatest([tool], latest);
    await latest.get(tool);
    await latest.get(tool, "native");
    expect(tool.getLatestVersion).toHaveBeenCalledTimes(1);
  });

  it("keys lookups by the tool's channel", () => {
    const tool = fakeTool({ id: "kimi", latestChannel: (m) => (m === "pip" ? "pypi" : "npm") });
    expect(LatestResolver.key(tool, "pip")).toBe("kimi:pypi");
    expect(LatestResolver.key(tool, "native")).toBe("kimi:npm");
    expect(LatestResolver.key(fakeTool())).toBe("tool:default");
  });

  it("serves fresh cache hits without a network call and remembers their age", async () => {
    const cache = emptyCache();
    cache.set("tool:default", "1.5.0");
    const tool = fakeTool();
    const latest = new LatestResolver(cache);
    expect(await latest.get(tool)).toBe("1.5.0");
    expect(tool.getLatestVersion).not.toHaveBeenCalled();
    expect(latest.oldestCachedAt).toBe(1_000_000);
  });

  it("bypasses the cache with --refresh and stores the fresh value", async () => {
    const cache = emptyCache();
    cache.set("tool:default", "1.5.0");
    const tool = fakeTool();
    const latest = new LatestResolver(cache, true);
    expect(await latest.get(tool)).toBe("2.0.0");
    expect(latest.oldestCachedAt).toBeNull();
    expect(cache.get("tool:default")?.version).toBe("2.0.0");
  });

  it("does not cache failed lookups", async () => {
    const cache = emptyCache();
    await new LatestResolver(cache).get(fakeTool({ getLatestVersion: async () => null }));
    expect(cache.get("tool:default")).toBeNull();
  });
});