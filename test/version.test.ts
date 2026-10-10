import { describe, expect, it } from "vitest";
import { compareVersions, extractVersion, sameVersion } from "../src/utils/version";

describe("extractVersion", () => {
  it.each([
    ["2.1.295 (Claude Code)", "2.1.295"],
    ["codex-cli 0.162.1", "0.162.1"],
    ["Google Cloud SDK 563.0.0\nbq 2.1.31", "563.0.0"],
    ["v22.11.0", "22.11.0"],
    ["kimi 2.1.0-beta.3", "2.1.0-beta.3"],
    ["version 1.2", "1.2"],
  ])("%j -> %s", (output, expected) => {
    expect(extractVersion(output)).toBe(expected);
  });

  it("returns null when there is no version", () => {
    expect(extractVersion("command not found")).toBeNull();
  });
});

describe("compareVersions", () => {
  it.each([
    ["2.1.295", "2.1.296", "outdated"],
    ["2.1.296", "2.1.296", "up-to-date"],
    ["0.28.1", "2.1.1", "outdated"],
    ["1.2", "1.2.1", "outdated"], // missing patch
    ["1.2", "1.2.0", "up-to-date"],
    ["2.0.0-beta.1", "2.0.0", "outdated"], // prerelease is older than its release
    ["2.1.0-beta.1", "2.0.0", "up-to-date"], // ahead of latest on a preview channel
    ["2.0.0", "2.0.0-rc.1", "up-to-date"],
    ["v1.0.0", "1.0.1", "outdated"],
  ] as const)("%s vs latest %s -> %s", (installed, latest, state) => {
    expect(compareVersions(installed, latest)).toBe(state);
  });

  it("is unknown (never a false 'outdated') when a side is missing or unparseable", () => {
    expect(compareVersions(null, "1.0.0")).toBe("unknown");
    expect(compareVersions("1.0.0", null)).toBe("unknown");
    expect(compareVersions("latest", "1.0.0")).toBe("unknown");
  });
});

describe("sameVersion", () => {
  it("compares normalized versions", () => {
    expect(sameVersion("1.2", "1.2.0")).toBe(true);
    expect(sameVersion("v0.162.1", "0.162.1")).toBe(true);
    expect(sameVersion("0.162.0", "0.162.1")).toBe(false);
    expect(sameVersion(null, "1.0.0")).toBe(false);
  });
});