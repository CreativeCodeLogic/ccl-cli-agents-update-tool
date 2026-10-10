import { describe, expect, it } from "vitest";
import { findAllExecutables } from "../src/utils/which";
import { fakeHost, win } from "./helpers";

describe("findAllExecutables (win32)", () => {
  const npmDir = win("C:/Users/Jane Doe/AppData/Roaming/npm");
  const kimiDir = win("C:/Users/Jane Doe/.kimi-code/bin");
  const nodeDir = win("C:/Program Files/nodejs");
  const env = { Path: [kimiDir, nodeDir, npmDir].join(";"), PATHEXT: ".COM;.EXE;.BAT;.CMD" };

  it("returns every install in PATH order, first one = the one that runs", () => {
    const host = fakeHost({
      platform: "win32",
      homedir: win("C:/Users/Jane Doe"),
      env,
      files: [`${kimiDir}/kimi.exe`, `${npmDir}/kimi.cmd`, `${npmDir}/kimi.ps1`, `${npmDir}/kimi`],
    });
    expect(findAllExecutables(["kimi"], host)).toEqual([win(`${kimiDir}/kimi.exe`), win(`${npmDir}/kimi.cmd`)]);
  });

  it("counts .cmd/.ps1/extensionless variants in one directory as one install, PATHEXT first", () => {
    const host = fakeHost({
      platform: "win32",
      homedir: "C:/Users/Jane Doe",
      env,
      files: [`${npmDir}/claude.ps1`, `${npmDir}/claude.cmd`, `${npmDir}/claude`],
    });
    expect(findAllExecutables(["claude"], host)).toEqual([win(`${npmDir}/claude.cmd`)]);
  });

  it("finds PowerShell-only shims as a last resort and ignores extensionless files", () => {
    const host = fakeHost({ platform: "win32", homedir: "C:/u", env, files: [`${npmDir}/gemini.ps1`, `${npmDir}/codex`] });
    expect(findAllExecutables(["gemini"], host)).toEqual([win(`${npmDir}/gemini.ps1`)]);
    expect(findAllExecutables(["codex"], host)).toEqual([]);
  });

  it("collapses duplicate PATH entries (case, trailing separator, quotes) and keeps paths with spaces", () => {
    const host = fakeHost({
      platform: "win32",
      homedir: "C:/u",
      env: { PATH: [nodeDir, `${nodeDir.toUpperCase()}${win("/")}`, `"${nodeDir}"`].join(";") },
      files: [`${nodeDir}/npm.cmd`],
    });
    expect(findAllExecutables(["npm"], host)).toEqual([win(`${nodeDir}/npm.cmd`)]);
  });

  it("reads PATH case-insensitively and defaults PATHEXT", () => {
    const host = fakeHost({ platform: "win32", homedir: "C:/u", env: { pAtH: npmDir }, files: [`${npmDir}/firebase.cmd`] });
    expect(findAllExecutables(["firebase"], host)).toEqual([win(`${npmDir}/firebase.cmd`)]);
  });
});

describe("findAllExecutables (posix)", () => {
  it("keeps PATH order and collapses symlinked duplicates", () => {
    const host = fakeHost({
      platform: "linux",
      homedir: "/home/jane",
      env: { PATH: "/home/jane/.local/bin:/usr/local/bin:/usr/bin:/bin" },
      files: ["/home/jane/.local/bin/claude", "/usr/local/bin/claude", "/usr/bin/gcloud", "/bin/gcloud"],
      links: {
        "/usr/bin/gcloud": "/usr/lib/google-cloud-sdk/bin/gcloud",
        "/bin/gcloud": "/usr/lib/google-cloud-sdk/bin/gcloud",
      },
    });
    expect(findAllExecutables(["claude"], host)).toEqual(["/home/jane/.local/bin/claude", "/usr/local/bin/claude"]);
    expect(findAllExecutables(["gcloud"], host)).toEqual(["/usr/bin/gcloud"]);
  });

  it("does not apply Windows extensions and returns nothing for an empty PATH", () => {
    const host = fakeHost({ platform: "darwin", homedir: "/Users/jane", env: { PATH: "/opt/homebrew/bin" }, files: ["/opt/homebrew/bin/codex.cmd"] });
    expect(findAllExecutables(["codex"], host)).toEqual([]);
    expect(findAllExecutables(["codex"], fakeHost({ platform: "linux", homedir: "/h" }))).toEqual([]);
  });
});
