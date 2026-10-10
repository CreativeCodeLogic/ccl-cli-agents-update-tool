import { beforeAll, describe, expect, it, vi } from "vitest";

// Any real process spawn or network call fails the test loudly.
const spawnSpy = vi.hoisted(() => vi.fn(() => {
  throw new Error("cross-spawn must never be called in demo mode");
}));
vi.mock("cross-spawn", () => ({ default: spawnSpy }));
vi.mock("@clack/prompts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@clack/prompts")>()),
  box: vi.fn(),
  log: { step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() },
}));

import { createDemoRuntime, type DemoRuntime } from "../src/demo/runtime";
import { detectAll, resolveLatest } from "../src/scan";
import { applyUpdates, type UpdateTarget } from "../src/ui/update";
import { exec, execTee } from "../src/utils/exec";
import { fetchJson } from "../src/utils/http";
import { sideEffectsBlocked } from "../src/utils/sandbox";

const fetchSpy = vi.fn(async () => {
  throw new Error("fetch must never be called in demo mode");
});

let runtime: DemoRuntime;
beforeAll(() => {
  vi.stubGlobal("fetch", fetchSpy);
  runtime = createDemoRuntime({ sleep: async () => {}, write: () => {} });
});

async function scanDemo() {
  const detections = await detectAll(runtime.tools, runtime.host);
  const results = await resolveLatest(detections, runtime.latest);
  const targets: UpdateTarget[] = results
    .filter((r) => r.state === "outdated")
    .map((scan) => {
      const detection = detections.find((d) => d.tool.id === scan.id)!;
      return { scan, tool: detection.tool, instance: detection.instances[0]! };
    });
  return { results, targets };
}

describe("--demo", () => {
  it("blocks side effects process-wide", async () => {
    expect(sideEffectsBlocked()).toBe("demo mode");
    expect((await exec("node", ["--version"])).ok).toBe(false);
    expect((await execTee("npm", ["install", "-g", "x"])).code).toBeNull();
    expect(await fetchJson("https://registry.npmjs.org/npm/latest")).toBeNull();
    expect(spawnSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a fixture with every state: updates, up-to-date, not installed, hidden copy, manual plan", async () => {
    const { results } = await scanDemo();
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId.claude?.state).toBe("up-to-date");
    expect(byId.firebase?.state).toBe("not-installed");
    expect(byId.codex).toMatchObject({ state: "outdated", plan: { kind: "auto" } });
    expect(byId.kimi?.shadowed).toHaveLength(1);
    expect(byId.gcloud).toMatchObject({ installMethod: "apt", plan: { kind: "manual" } });
    expect(spawnSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cannot run a real command even if the real executor is used by mistake", async () => {
    const { targets } = await scanDemo();
    const auto = targets.filter((t) => t.scan.plan?.kind === "auto");
    expect(auto.length).toBeGreaterThan(0);
    const outcome = await applyUpdates(auto); // default executor = execTee
    expect(outcome.failed).toBe(auto.length);
    expect(spawnSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("simulates updates with the demo executor and re-checks the new versions", async () => {
    const { targets } = await scanDemo();
    const outcome = await applyUpdates(targets, runtime.latest.cache, runtime.executor);
    expect(outcome).toMatchObject({ updated: 3, manual: 1, failed: 0, unchanged: 0 });
    expect(spawnSpy).not.toHaveBeenCalled();
  });
});