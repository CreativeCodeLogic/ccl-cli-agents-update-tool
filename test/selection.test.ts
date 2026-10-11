import { describe, expect, it } from "vitest";
import { deriveState } from "../src/scan";
import { initialSelection, isOffered, recordSelection, selectedByDefault } from "../src/selection";
import type { ToolScan } from "../src/types";

const deprecation = { message: "retired", successorId: "agy" };

function scan(id: string, overrides: Partial<ToolScan> = {}): ToolScan {
  return {
    id,
    name: id,
    shortName: id,
    docsUrl: "https://example.test/${id}",
    installed: true,
    installMethod: "npm",
    binaryPath: `/usr/local/bin/${id}`,
    installedVersion: "1.0.0",
    latestVersion: "2.0.0",
    latestStaleCachedAt: null,
    group: "agents",
    notes: [],
    projectPin: null,
    state: "outdated",
    updateAvailable: true,
    needsAdmin: false,
    plan: { kind: "auto", command: ["npm", "install", "-g", `${id}@latest`] },
    shadowed: [],
    deprecation: null,
    ...overrides,
  };
}

describe("deriveState", () => {
  it("marks deprecated tools retired whatever their version, but keeps updateAvailable", () => {
    expect(deriveState({ deprecation }, "1.0.0", "2.0.0", true)).toEqual({ state: "retired", updateAvailable: true });
    expect(deriveState({ deprecation }, "2.0.0", "2.0.0", true)).toEqual({ state: "retired", updateAvailable: false });
  });

  it("shows self-updating tools without a latest version as 'self-updating', never 'unknown'", () => {
    expect(deriveState({ selfUpdating: true }, "1.2.3", null, true)).toEqual({ state: "self-updating", updateAvailable: false });
    expect(deriveState({}, "1.2.3", null, true).state).toBe("unknown");
    expect(deriveState({ selfUpdating: true }, "1.2.3", "1.2.3", true).state).toBe("up-to-date");
  });

  it("reports missing tools as not installed even when deprecated", () => {
    expect(deriveState({ deprecation }, null, "2.0.0", false)).toEqual({ state: "not-installed", updateAvailable: false });
  });
});

describe("isOffered", () => {
  it("offers outdated tools, self-updaters and retired tools that are behind", () => {
    expect(isOffered(scan("codex"))).toBe(true);
    expect(isOffered(scan("cursor", { state: "self-updating", updateAvailable: false, latestVersion: null }))).toBe(true);
    expect(isOffered(scan("gemini", { state: "retired", deprecation }))).toBe(true);
  });

  it("does not offer current, retired-and-current, missing or plan-less tools", () => {
    expect(isOffered(scan("a", { state: "up-to-date", updateAvailable: false }))).toBe(false);
    expect(isOffered(scan("b", { state: "retired", updateAvailable: false, deprecation }))).toBe(false);
    expect(isOffered(scan("c", { installed: false, state: "not-installed" }))).toBe(false);
    expect(isOffered(scan("d", { plan: null }))).toBe(false);
  });
});

describe("initialSelection", () => {
  const offered = [
    scan("codex"),
    scan("gemini", { state: "retired", deprecation }),
    scan("cursor", { state: "self-updating", updateAvailable: false }),
    scan("gcloud", { plan: { kind: "manual", command: "x", reason: "y" } }),
  ];

  it("without remembered choices: preselects everything except retired and self-updating tools", () => {
    expect(selectedByDefault(offered[1]!)).toBe(false);
    expect(initialSelection(offered, {})).toEqual({ ids: ["codex", "gcloud"], remembered: false });
  });

  it("applies remembered choices per tool: 'update' ticks (even retired), 'skip' unticks", () => {
    const selection = initialSelection(offered, { gemini: "update", gcloud: "skip", unrelated: "update" });
    expect(selection).toEqual({ ids: ["codex", "gemini"], remembered: true });
  });

  it("ignores remembered choices for tools that are not offered this time", () => {
    expect(initialSelection([scan("codex")], { gcloud: "skip" })).toEqual({ ids: ["codex"], remembered: false });
  });
});

describe("recordSelection", () => {
  it("stores ticked as update and offered-but-unticked as skip, keeping other entries", () => {
    const offered = [scan("codex"), scan("gcloud"), scan("kimi")];
    expect(recordSelection({ claude: "skip", gcloud: "update" }, offered, ["codex", "kimi"])).toEqual({
      claude: "skip",
      codex: "update",
      gcloud: "skip",
      kimi: "update",
    });
  });
});
