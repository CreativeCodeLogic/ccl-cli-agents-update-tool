import { describe, expect, it } from "vitest";
import { createNoticeSlot, detectInstallContext, nodeModulesParent, selfCheckEnabled, selfUpdateNotice } from "../src/self";
import { displayVersion } from "../src/ui/format";
import { clearScreenKeepScrollback, shouldClearScreen } from "../src/ui/screen";
import { win } from "./helpers";

describe("detectInstallContext", () => {
  const ctx = (entryPath: string, platform: NodeJS.Platform, insideProject = false, env: Record<string, string> = {}) =>
    detectInstallContext({ entryPath, env, insideProject, platform });

  it.each([
    ["npx cache (POSIX)", "/home/jane/.npm/_npx/4f2c1a/node_modules/ccl-caut/dist/index.js", "linux", "npx"],
    ["npx cache (Windows)", win("C:/Users/Jane/AppData/Local/npm-cache/_npx/4f2c1a/node_modules/ccl-caut/dist/index.js"), "win32", "npx"],
    ["global npm (Windows prefix)", win("C:/Users/Jane/AppData/Roaming/npm/node_modules/ccl-caut/dist/index.js"), "win32", "global"],
    ["global npm (POSIX prefix)", "/usr/local/lib/node_modules/ccl-caut/dist/index.js", "darwin", "global"],
    ["global under nvm", "/home/jane/.nvm/versions/node/v22.11.0/lib/node_modules/ccl-caut/dist/index.js", "linux", "global"],
    ["source checkout", "/home/jane/src/ccl-cli-agents-update-tool/dist/index.js", "linux", "source"],
    ["dev run with tsx", win("V:/work/ccl-cli-agents-update-tool/src/index.ts"), "win32", "source"],
  ] as const)("%s -> %s", (_label, entry, platform, expected) => {
    expect(ctx(entry, platform)).toBe(expected);
  });

  it("treats a node_modules inside a project as a project dependency", () => {
    expect(ctx("/home/jane/app/node_modules/ccl-caut/dist/index.js", "linux", true)).toBe("project");
  });

  it("trusts npm_command=exec (npx) even outside the _npx cache", () => {
    expect(ctx("/home/jane/app/node_modules/ccl-caut/dist/index.js", "linux", true, { npm_command: "exec" })).toBe("npx");
  });

  it("finds the folder that holds node_modules", () => {
    expect(nodeModulesParent("/home/jane/app/node_modules/ccl-caut/dist/index.js", "linux")).toBe("/home/jane/app");
    expect(nodeModulesParent(win("C:/Users/Jane/AppData/Roaming/npm/node_modules/ccl-caut/dist/index.js"), "win32")).toBe(win("C:/Users/Jane/AppData/Roaming/npm"));
    expect(nodeModulesParent("/home/jane/src/ccl/dist/index.js", "linux")).toBeNull();
  });
});

describe("selfUpdateNotice", () => {
  it("suggests the upgrade that matches how ccl-caut runs", () => {
    expect(selfUpdateNotice("1.0.0", "1.0.1", "global")).toBe("ccl-caut 1.0.1 is available · npm i -g ccl-caut");
    expect(selfUpdateNotice("1.0.0", "1.1.0", "npx")).toBe("ccl-caut 1.1.0 is available · npx ccl-caut@latest");
    expect(selfUpdateNotice("1.0.0", "2.0.0", "project")).toBe("ccl-caut 2.0.0 is available · npm i ccl-caut@latest");
  });

  it("stays silent for source checkouts, current or newer builds, failed lookups and bad versions", () => {
    expect(selfUpdateNotice("1.0.0", "1.0.1", "source")).toBeNull();
    expect(selfUpdateNotice("1.0.1", "1.0.1", "global")).toBeNull();
    expect(selfUpdateNotice("1.1.0", "1.0.1", "global")).toBeNull();
    expect(selfUpdateNotice("1.0.0", null, "global")).toBeNull();
    expect(selfUpdateNotice("1.0.0", "1.0.1", null)).toBeNull();
    expect(selfUpdateNotice("1.0.0", "not-a-version", "global")).toBeNull();
  });

  it("handles release candidates sanely", () => {
    // The final release is newer than its candidates.
    expect(selfUpdateNotice("1.0.0-rc.1", "1.0.0", "global")).toBe("ccl-caut 1.0.0 is available · npm i -g ccl-caut");
    // Never "update" an rc user to an older stable or an earlier candidate.
    expect(selfUpdateNotice("1.0.0-rc.2", "0.9.0", "global")).toBeNull();
    expect(selfUpdateNotice("1.0.0-rc.2", "1.0.0-rc.1", "global")).toBeNull();
    // Nothing published yet (npm 404 -> latest null): silent.
    expect(selfUpdateNotice("1.0.0-rc.1", null, "global")).toBeNull();
  });

  it("is disabled in CI and with CCL_CAUT_NO_UPDATE_CHECK=1", () => {
    expect(selfCheckEnabled({})).toBe(true);
    expect(selfCheckEnabled({ CI: "true" })).toBe(false);
    expect(selfCheckEnabled({ CCL_CAUT_NO_UPDATE_CHECK: "1" })).toBe(false);
  });
});

describe("createNoticeSlot", () => {
  it("shows the notice once, at the first slot where the latest version is known", () => {
    let latest: string | null = null;
    const slot = createNoticeSlot("1.0.0", "global", () => latest);
    expect(slot.take()).toBeNull(); // banner: lookup still running
    expect(slot.take()).toBeNull(); // after the notes: still running
    latest = "1.0.1"; // lands during the update phase
    expect(slot.take()).toBe("ccl-caut 1.0.1 is available · npm i -g ccl-caut"); // after the summary
    expect(slot.take()).toBeNull(); // never twice
  });

  it("never shows anything for a source checkout", () => {
    expect(createNoticeSlot("1.0.0", "source", () => "9.9.9").take()).toBeNull();
  });
});

describe("screen clearing", () => {
  const base = { interactive: true, isTTY: true, env: {}, noClear: false, demo: false };

  it("clears only interactive TTY runs outside CI, unless --no-clear", () => {
    expect(shouldClearScreen(base)).toBe(true);
    expect(shouldClearScreen({ ...base, interactive: false })).toBe(false);
    expect(shouldClearScreen({ ...base, isTTY: false })).toBe(false);
    expect(shouldClearScreen({ ...base, noClear: true })).toBe(false);
    expect(shouldClearScreen({ ...base, env: { CI: "true" } })).toBe(false);
  });

  it("still clears for --demo recordings in CI", () => {
    expect(shouldClearScreen({ ...base, env: { CI: "true" }, demo: true })).toBe(true);
    expect(shouldClearScreen({ ...base, demo: true, noClear: true })).toBe(false);
  });

  it("pushes the screen into scrollback (one newline per row, cursor home) and never erases scrollback", () => {
    let written = "";
    const out = { rows: 5, write: (s: string) => ((written += s), true) } as unknown as NodeJS.WriteStream;
    clearScreenKeepScrollback(out);
    expect(written).toBe("\n\n\n\n\n\x1b[H");
    expect(written).not.toContain("\x1b[3J");
    expect(written).not.toContain("\x1b[2J");
  });
});

describe("displayVersion", () => {
  it.each([
    ["2026.10.01-e373342", "2026.10.01"],
    ["2026.06.12-19-59-36-f6aba9a", "2026.06.12"],
    ["0.25.1-preview.1", "0.25.1-preview.1"], // prerelease, not a build suffix
    ["2.1.0-beta.3", "2.1.0-beta.3"],
    ["588.0.0", "588.0.0"],
    ["1.0.96-2", "1.0.96-2"],
  ])("%s -> %s", (input, expected) => {
    expect(displayVersion(input)).toBe(expected);
  });
});