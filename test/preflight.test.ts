import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { gcloud } from "../src/registry/gcloud";
import { countRunning, processSignatures, splitUnattended, type ProcessInfo } from "../src/processes";
import { computeNeedsAdmin } from "../src/scan";
import { fitToWidth, formatElapsed } from "../src/ui/live";
import { CANCELLED, checklist, choose, QUIT, RETRY } from "../src/ui/prompts";
import { OutputTracker, withNpmProgress } from "../src/ui/update";
import { setHost } from "../src/utils/host";
import { fakeHost, instance, win } from "./helpers";

describe("running-process detection", () => {
  const winHost = fakeHost({ platform: "win32", homedir: win("C:/Users/Jane") });
  const npmDir = win("C:/Users/Jane/AppData/Roaming/npm");
  const codexShim = instance(win(`${npmDir}/codex.cmd`), "npm");
  const kimiExe = instance(win("C:/Users/Jane/.kimi-code/bin/kimi.exe"), "native");

  const winProcesses: ProcessInfo[] = [
    { pid: 10, commandLine: `"C:\\Program Files\\nodejs\\node.exe" "${win(`${npmDir}/node_modules/@openai/codex/bin/codex.js`)}"` },
    { pid: 11, commandLine: `C:\\WINDOWS\\system32\\cmd.exe /d /s /c ""${win(`${npmDir}/codex.cmd`)}" "` },
    { pid: 12, commandLine: `"C:\\Program Files\\nodejs\\node.exe" "${win(`${npmDir}/node_modules/@openai/codex-sdk/index.js`)}"` },
    { pid: 13, commandLine: `"${win("C:/Users/Jane/.kimi-code/bin/kimi.exe")}" --continue` },
    { pid: 14, commandLine: "codex.exe --help" }, // a different program that is only *named* codex
    { pid: 99, commandLine: `"C:\\Program Files\\nodejs\\node.exe" "${win(`${npmDir}/node_modules/@openai/codex/bin/codex.js`)}"` },
  ];

  it("matches the doubled separator npm's Windows shims put on the command line", () => {
    const firebase = instance(win(`${npmDir}/firebase.cmd`), "npm");
    const tools = [{ id: "firebase", signatures: processSignatures(firebase, "firebase-tools", winHost) }];
    const line = `"node"   "C:\\Users\\Jane\\AppData\\Roaming\\npm\\\\node_modules\\firebase-tools\\lib\\bin\\firebase.js" init`;
    expect(countRunning([{ pid: 21552, commandLine: line }], tools, "win32", 1)).toEqual(new Map([["firebase", 1]]));
  });

  it("matches npm CLIs by package folder (node.exe) and shim, never by bare name or a similar package", () => {
    const tools = [
      { id: "codex", signatures: processSignatures(codexShim, "@openai/codex", winHost) },
      { id: "kimi", signatures: processSignatures(kimiExe, "@moonshot-ai/kimi-code", winHost) },
    ];
    const counts = countRunning(winProcesses, tools, "win32", 99);
    expect(counts.get("codex")).toBe(2); // node.exe + cmd.exe, not codex-sdk, not "codex.exe --help", not our own pid
    expect(counts.get("kimi")).toBe(1);
  });

  it("matches POSIX npm installs through the symlink target's package folder", () => {
    const linux = fakeHost({ platform: "linux", homedir: "/home/jane" });
    const codex = instance("/usr/local/bin/codex", "npm", "/usr/local/lib/node_modules/@openai/codex/bin/codex.js");
    const sigs = processSignatures(codex, "@openai/codex", linux);
    expect(sigs).toContain("/usr/local/lib/node_modules/@openai/codex/");
    const ps: ProcessInfo[] = [
      { pid: 1, commandLine: "node /usr/local/lib/node_modules/@openai/codex/bin/codex.js" },
      { pid: 2, commandLine: "/usr/local/lib/node_modules/@openai/codex/vendor/x86_64-unknown-linux-musl/codex/codex" },
      { pid: 3, commandLine: "vim /home/jane/notes/codex.md" },
    ];
    expect(countRunning(ps, [{ id: "codex", signatures: sigs }], "linux", 0).get("codex")).toBe(2);
  });

  it("reports nothing when no selected tool runs", () => {
    expect(countRunning([{ pid: 1, commandLine: "bash" }], [{ id: "codex", signatures: ["/x/codex"] }], "linux", 0).size).toBe(0);
  });
});

describe("--yes and running tools", () => {
  const targets = [
    { id: "codex", claudeAuto: false },
    { id: "claude", claudeAuto: true },
    { id: "kimi", claudeAuto: false },
  ];

  it("skips running tools and keeps the rest", () => {
    const { keep, skipped } = splitUnattended(targets, new Map([["codex", 2]]), false);
    expect(keep.map((t) => t.id)).toEqual(["claude", "kimi"]);
    expect(skipped).toEqual([{ target: targets[0], reason: "running", processes: 2 }]);
  });

  it("skips Claude Code inside a Claude Code session, and keeps going when process listing failed", () => {
    const { keep, skipped } = splitUnattended(targets, null, true);
    expect(keep.map((t) => t.id)).toEqual(["codex", "kimi"]);
    expect(skipped.map((s) => s.reason)).toEqual(["claude-session"]);
  });
});

describe("administrator rights", () => {
  const programFiles = win("C:/Program Files/nodejs");
  const roaming = win("C:/Users/Jane/AppData/Roaming/npm");
  const host = fakeHost({ platform: "win32", homedir: win("C:/Users/Jane"), writable: [roaming] });
  const npmPlan = { kind: "auto" as const, command: ["npm", "install", "-g", "@openai/codex@latest"] };

  it("flags npm plans whose global folder is not writable", () => {
    const i = instance(win(`${roaming}/codex.cmd`), "npm");
    expect(computeNeedsAdmin({}, i, npmPlan, host, win(`${roaming}/node_modules`))).toBe(false);
    expect(computeNeedsAdmin({}, i, npmPlan, host, win(`${programFiles}/node_modules`))).toBe(true);
  });

  it("flags self-updaters by the folder they update, and manual plans by sudo or the plan's own flag", () => {
    const native = instance(win("C:/Users/Jane/.kimi-code/bin/kimi.exe"), "native");
    expect(computeNeedsAdmin({}, native, { kind: "auto", command: [native.path, "upgrade"] }, host, null)).toBe(true);
    const ok = fakeHost({ platform: "win32", homedir: win("C:/Users/Jane"), writable: [win("C:/Users/Jane")] });
    expect(computeNeedsAdmin({}, native, { kind: "auto", command: [native.path, "upgrade"] }, ok, null)).toBe(false);
    expect(computeNeedsAdmin({}, native, { kind: "manual", command: "sudo snap refresh google-cloud-cli", reason: "" }, host, null)).toBe(true);
    expect(computeNeedsAdmin({}, native, { kind: "manual", command: "choco upgrade opencode -y", reason: "", needsAdmin: true }, host, null)).toBe(true);
    expect(computeNeedsAdmin({}, native, { kind: "manual", command: "brew upgrade gemini-cli", reason: "" }, host, null)).toBe(false);
  });

  it("checks the npm global folder for a manual npm self-update", () => {
    const npmSelf = { kind: "manual" as const, command: "npm install -g npm@latest", reason: "" };
    const i = instance(win(`${programFiles}/nodejs/npm.cmd`), "npm");
    expect(computeNeedsAdmin({}, i, npmSelf, host, win(`${programFiles}/nodejs/node_modules`))).toBe(true);
    expect(computeNeedsAdmin({}, i, npmSelf, host, win(`${roaming}/node_modules`))).toBe(false);
  });

  it("never asks for admin when ccl-caut already runs elevated", () => {
    const elevated = { ...host, elevated: true };
    expect(computeNeedsAdmin({}, instance("x", "npm"), npmPlan, elevated, win(`${programFiles}/node_modules`))).toBe(false);
  });

  it("lets gcloud under Program Files update automatically only when elevated", async () => {
    const root = win("C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk");
    const base = fakeHost({ platform: "win32", homedir: win("C:/Users/Jane"), env: { "ProgramFiles(x86)": win("C:/Program Files (x86)") }, files: [win(`${root}/VERSION`)] });
    const i = instance(win(`${root}/bin/gcloud.cmd`), "native");
    let restore = setHost(base);
    expect(await gcloud.getUpdatePlan(i)).toMatchObject({ kind: "manual", needsAdmin: true });
    restore();
    restore = setHost({ ...base, elevated: true });
    expect(await gcloud.getUpdatePlan(i)).toMatchObject({ kind: "auto" });
    restore();
  });
});

/** Feed keys into a real @clack/core prompt. */
function keys(...sequence: string[]) {
  const input = new PassThrough();
  const output = new Writable({ write: (_c, _e, cb) => cb() });
  setTimeout(async () => {
    for (const k of sequence) {
      input.write(k);
      await new Promise((r) => setTimeout(r, 15));
    }
  }, 20);
  return { input, output };
}

describe("prompts: quit and selection keys", () => {
  const options = [
    { value: "codex", label: "Codex CLI" },
    { value: "kimi", label: "Kimi Code" },
  ];

  it("r retries only where Retry is offered", async () => {
    expect(await checklist({ message: "Select", options, initialValues: ["codex"], retry: true, ...keys("r") })).toBe(RETRY);
    expect(await choose({ message: "Next?", options, retry: true, ...keys("r") })).toBe(RETRY);
    // Without Retry on offer, r does nothing and q still quits.
    expect(await checklist({ message: "Select", options, initialValues: ["codex"], ...keys("r", "q") })).toBe(QUIT);
  });

  it("q quits the checklist softly", async () => {
    expect(await checklist({ message: "Select", options, initialValues: ["codex"], ...keys("q") })).toBe(QUIT);
  });

  it("Esc / Ctrl+C cancel (exit 130 path)", async () => {
    expect(await checklist({ message: "Select", options, initialValues: [], ...keys("\x1b") })).toBe(CANCELLED);
    expect(await choose({ message: "Next?", options, ...keys("\x03") })).toBe(CANCELLED);
  });

  it("space toggles, a toggles all, enter confirms", async () => {
    expect(await checklist({ message: "Select", options, initialValues: ["codex"], ...keys(" ", "\r") })).toEqual([]);
    expect(await checklist({ message: "Select", options, initialValues: [], ...keys("a", "\r") })).toEqual(["codex", "kimi"]);
  });

  it("q quits a menu softly; enter picks the focused option", async () => {
    expect(await choose({ message: "Next?", options, ...keys("q") })).toBe(QUIT);
    expect(await choose({ message: "Next?", options, initialValue: "kimi", ...keys("\r") })).toBe("kimi");
  });
});

describe("live update progress", () => {
  it("formats elapsed time as m:ss and fits lines to the terminal", () => {
    expect(formatElapsed(7_400)).toBe("0:07");
    expect(formatElapsed(83_000)).toBe("1:23");
    expect(fitToWidth("x".repeat(30), 10)).toBe(`${"x".repeat(9)}…`);
    expect(fitToWidth("short  ", 10)).toBe("short");
  });

  it("counts npm http fetches and keeps the latest other line", () => {
    const tracker = new OutputTracker();
    tracker.feed("npm http fetch GET 200 https://registry.npmjs.org/a 50ms\nnpm http cache b 1ms (cache hit)\n");
    tracker.feed("\nchanged 2 pack");
    tracker.feed("ages in 3s");
    tracker.end();
    expect(tracker.counter()).toBe("fetched 2 files");
    expect(tracker.latest).toBe("changed 2 packages in 3s");
    expect(tracker.tail(20)).toHaveLength(3);
  });

  it("adds --loglevel=http to npm installs only", () => {
    expect(withNpmProgress("npm", ["install", "-g", "x@latest"])).toEqual(["install", "-g", "x@latest", "--loglevel=http"]);
    expect(withNpmProgress("/home/jane/.local/bin/claude", ["update"])).toEqual(["update"]);
    expect(withNpmProgress("npm", ["install", "--loglevel=silly"])).toEqual(["install", "--loglevel=silly"]);
  });
});