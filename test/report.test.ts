import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browseCommand,
  clipboardCommand,
  defaultReportName,
  reportPrompt,
  wantsReportPrompt,
  writeOutputFile,
  type ReportPromptDeps,
} from "../src/report";
import { headerLine, headerStyle } from "../src/ui/banner";
import { CANCELLED, QUIT } from "../src/ui/prompts";

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
const strip = (s: string) => s.replace(ANSI, "");
const JSON_TEXT = `${JSON.stringify({ tool: "ccl-caut", tools: [1, 2] }, null, 2)}\n`;
const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccl-caut-report-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("header policy", () => {
  const tty = true;
  it("big banner only on the default interactive run", () => {
    expect(headerStyle({}, tty, {})).toBe("banner");
    for (const flag of ["check", "discover", "doctor", "help", "resetSelection", "yes"] as const) expect(headerStyle({ [flag]: true }, tty, {})).toBe("line");
    for (const flag of ["only", "hideGroup", "showGroup"] as const) expect(headerStyle({ [flag]: "dev" }, tty, {})).toBe("line");
  });

  it("no header for --json, --version, piped output or CI", () => {
    expect(headerStyle({ json: true }, tty, {})).toBe("none");
    expect(headerStyle({ version: true }, tty, {})).toBe("none");
    expect(headerStyle({}, false, {})).toBe("none");
    expect(headerStyle({ check: true }, false, {})).toBe("none");
    expect(headerStyle({}, tty, { CI: "true" })).toBe("none");
  });

  it("one compact header line, name first", () => {
    expect(strip(headerLine("1.1.0"))).toBe("CCL CAUT v1.1.0 · CLI Agents Update Tool — by Creative Code Logic");
  });
});

describe("--json prompt: only for a person at a terminal", () => {
  it("is skipped for pipes, CI and --yes", () => {
    expect(wantsReportPrompt(true, {}, false)).toBe(true);
    expect(wantsReportPrompt(false, {}, false)).toBe(false);
    expect(wantsReportPrompt(true, { CI: "1" }, false)).toBe(false);
    expect(wantsReportPrompt(true, {}, true)).toBe(false);
  });

  it("piped --json output is exactly the JSON (stdout byte-for-byte, nothing on stderr)", () => {
    const require = createRequire(import.meta.url);
    const tsx = require.resolve("tsx/cli");
    const res = spawnSync(process.execPath, [tsx, "src/index.ts", "--demo", "--json"], { encoding: "utf8", env: { ...process.env, CI: "", NO_COLOR: "1" }, timeout: 60_000 });
    expect(res.status).toBe(0);
    expect(res.stdout).toBe(`${JSON.stringify(JSON.parse(res.stdout), null, 2)}\n`);
    expect(res.stdout).not.toMatch(/Copy to clipboard|Save to file|CCL CAUT v/);
    expect(res.stderr).toBe("");
  }, 60_000);
});

describe("clipboard", () => {
  const none = () => false;
  const only = (...names: string[]) => (n: string) => names.includes(n);
  it("Windows: PowerShell Set-Clipboard from a UTF-8 file (not clip.exe)", () => {
    const c = clipboardCommand("win32", none, "C:/t/report.json")!;
    expect(c.command).toBe("powershell");
    expect(c.args.join(" ")).toContain("Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 -LiteralPath 'C:/t/report.json')");
    expect(c.stdin).toBe(false);
  });
  it("macOS pbcopy; Linux wl-copy, else xclip, else xsel; else none", () => {
    expect(clipboardCommand("darwin", only("pbcopy"))).toEqual({ command: "pbcopy", args: [], stdin: true });
    expect(clipboardCommand("linux", only("wl-copy", "xclip"))?.command).toBe("wl-copy");
    expect(clipboardCommand("linux", only("xclip", "xsel"))).toEqual({ command: "xclip", args: ["-selection", "clipboard"], stdin: true });
    expect(clipboardCommand("linux", only("xsel"))).toEqual({ command: "xsel", args: ["--clipboard", "--input"], stdin: true });
    expect(clipboardCommand("linux", none)).toBeNull();
  });
});

describe("Browse… (native save dialog)", () => {
  const all = () => true;
  it("Windows SaveFileDialog and macOS choose file name", () => {
    expect(browseCommand("win32", {}, all, "r.json", "C:/x")?.args.join(" ")).toContain("System.Windows.Forms.SaveFileDialog");
    expect(browseCommand("darwin", {}, all, "r.json", "/x")?.args.join(" ")).toContain("choose file name");
  });
  it("Linux only with a display and zenity or kdialog", () => {
    expect(browseCommand("linux", {}, all, "r.json", "/x")).toBeNull();
    expect(browseCommand("linux", { DISPLAY: ":0" }, (n) => n === "zenity", "r.json", "/x")?.command).toBe("zenity");
    expect(browseCommand("linux", { WAYLAND_DISPLAY: "wayland-0" }, (n) => n === "kdialog", "r.json", "/x")?.command).toBe("kdialog");
    expect(browseCommand("linux", { DISPLAY: ":0" }, () => false, "r.json", "/x")).toBeNull();
  });
  it("never over SSH", () => {
    for (const platform of ["win32", "darwin", "linux"] as const) {
      expect(browseCommand(platform, { SSH_CONNECTION: "1.2.3.4 5 6.7.8.9 22", DISPLAY: ":0" }, all, "r.json", "/x")).toBeNull();
    }
  });
});

describe("--output", () => {
  it("writes the JSON, refuses to overwrite unless --force", () => {
    const dir = tempDir();
    const file = path.join(dir, "scan.json");
    expect(writeOutputFile(file, JSON_TEXT, false)).toEqual({ ok: true, path: file, simulated: false });
    expect(readFileSync(file, "utf8")).toBe(JSON_TEXT);
    const again = writeOutputFile(file, JSON_TEXT, false);
    expect(again.ok).toBe(false);
    expect(again.ok ? "" : again.error).toContain("use --force to overwrite it");
    writeFileSync(file, "old");
    expect(writeOutputFile(file, JSON_TEXT, true).ok).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(JSON_TEXT);
  });
  it("is simulated in demo mode", () => {
    const file = path.join(tempDir(), "demo.json");
    expect(writeOutputFile(file, JSON_TEXT, false, undefined, true)).toMatchObject({ ok: true, simulated: true });
    expect(existsSync(file)).toBe(false);
  });
});

/** Scripted prompts and recorded side effects. */
function fakeDeps(over: Partial<ReportPromptDeps> & { answers: unknown[] }): ReportPromptDeps & { said: string[]; warned: string[]; runs: unknown[][]; writes: [string, string][]; menus: string[][] } {
  const said: string[] = [];
  const warned: string[] = [];
  const runs: unknown[][] = [];
  const writes: [string, string][] = [];
  const menus: string[][] = [];
  const answers = [...over.answers];
  const next = async () => answers.shift() as never;
  const deps = {
    platform: "darwin" as NodeJS.Platform,
    env: {},
    cwd: "/work",
    now: () => new Date(2026, 9, 12),
    demo: false,
    has: () => true,
    run: vi.fn(async (command, input) => {
      runs.push([command, input]);
      return { ok: true, stdout: "" };
    }),
    fs: { exists: () => false, write: (file: string, text: string) => void writes.push([file, text]) },
    choose: (async (opts: { options: { label: string }[] }) => {
      menus.push(opts.options.map((o) => o.label));
      return next();
    }) as never,
    ask: next as never,
    say: (m: string) => void said.push(strip(m)),
    warn: (m: string) => void warned.push(strip(m)),
    ...over,
  };
  return Object.assign(deps, { said, warned, runs, writes, menus });
}

describe("copy / save prompt", () => {
  it("copies with the platform's clipboard tool and says how many lines", async () => {
    const deps = fakeDeps({ answers: ["copy", "done"] });
    await reportPrompt(JSON_TEXT, deps);
    expect(deps.runs[0]).toEqual([{ command: "pbcopy", args: [], stdin: true }, JSON_TEXT]);
    expect(deps.said).toEqual([`Copied ${JSON_TEXT.trimEnd().split("\n").length} lines`]);
    expect(deps.menus[0]).toEqual(["Copy to clipboard", "Save to file", "Browse…", "Done"]);
  });

  it("without a clipboard tool, says so and suggests Save", async () => {
    const deps = fakeDeps({ platform: "linux", env: {}, has: () => false, answers: ["copy", QUIT] });
    await reportPrompt(JSON_TEXT, deps);
    expect(deps.warned[0]).toContain("Use Save to file instead");
    expect(deps.runs).toEqual([]);
  });

  it("saves to the prefilled path in the current folder, confirming an overwrite", async () => {
    const existing = new Set(["/work/ccl-caut-report-2026-10-12.json"]);
    const deps = fakeDeps({
      answers: ["save", "./ccl-caut-report-2026-10-12.json", "again", "./other.json", "done"],
      fs: { exists: (f) => existing.has(f.replace(/\\/g, "/").replace(/^[A-Z]:/i, "")), write: () => {} },
    });
    const writes: [string, string][] = [];
    deps.fs.write = (f, t) => void writes.push([f, t]);
    await reportPrompt(JSON_TEXT, deps);
    expect(defaultReportName(new Date(2026, 9, 12))).toBe("ccl-caut-report-2026-10-12.json");
    expect(deps.menus[1]).toEqual(["Overwrite", "Choose another name", "Cancel"]);
    expect(writes).toHaveLength(1);
    expect(writes[0]![0].replace(/\\/g, "/")).toMatch(/\/work\/other\.json$/);
    expect(writes[0]![1]).toBe(JSON_TEXT);
    expect(deps.said[0]).toMatch(/^Saved .*other\.json$/);
  });

  it("over SSH there is no Browse… choice", async () => {
    const deps = fakeDeps({ env: { SSH_CONNECTION: "x" }, answers: [CANCELLED] });
    await reportPrompt(JSON_TEXT, deps);
    expect(deps.menus[0]).toEqual(["Copy to clipboard", "Save to file", "Done"]);
  });

  it("in demo mode copy and save are simulated (no commands, no files)", async () => {
    const deps = fakeDeps({ demo: true, answers: ["copy", "save", "./r.json", "done"] });
    await reportPrompt(JSON_TEXT, deps);
    expect(deps.runs).toEqual([]);
    expect(deps.writes).toEqual([]);
    expect(deps.said[0]).toContain("(demo: nothing was copied)");
    expect(deps.said[1]).toContain("(demo: nothing was written)");
    expect(deps.menus[0]).not.toContain("Browse…");
  });
});