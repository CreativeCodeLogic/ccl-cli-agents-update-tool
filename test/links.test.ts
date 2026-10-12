import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { helpText } from "../src/utils/args";
import { UserConfig } from "../src/utils/config";
import { getHost, type Host } from "../src/utils/host";
import { helpFooter, ISSUES_URL, link, REPO_URL, reportBugLine, shouldShowStar, starLine, supportsHyperlinks } from "../src/ui/links";

const ESC = String.fromCharCode(27);
/** What a person sees (and copies): OSC 8 sequences and colors removed. */
const ST = ESC + String.fromCharCode(92); // OSC string terminator
const visible = (s: string) =>
  s
    .split(`${ESC}]8;;`)
    .map((part, i) => (i === 0 ? part : part.slice(part.indexOf(ST) + 2)))
    .join("")
    .replace(new RegExp(`${ESC}[[][0-9;]*m`, "g"), "");

describe("OSC 8 hyperlinks", () => {
  it("only in terminals known to render them", () => {
    expect(supportsHyperlinks({ WT_SESSION: "x" }, true)).toBe(true); // Windows Terminal
    expect(supportsHyperlinks({ TERM_PROGRAM: "vscode" }, true)).toBe(true);
    expect(supportsHyperlinks({ TERM_PROGRAM: "iTerm.app" }, true)).toBe(true);
    expect(supportsHyperlinks({ VTE_VERSION: "7600" }, true)).toBe(true); // recent GNOME Terminal
    expect(supportsHyperlinks({ KONSOLE_VERSION: "230804" }, true)).toBe(true);
    expect(supportsHyperlinks({}, true)).toBe(false); // classic conhost / unknown
    expect(supportsHyperlinks({ VTE_VERSION: "4800" }, true)).toBe(false); // too old
    expect(supportsHyperlinks({ WT_SESSION: "x", CI: "true" }, true)).toBe(false);
    expect(supportsHyperlinks({ WT_SESSION: "x" }, false)).toBe(false); // piped
  });

  it("keep the URL as the visible text, so copy-paste gives the URL", () => {
    const on = link(REPO_URL, true);
    expect(on).toBe(`${ESC}]8;;${REPO_URL}${ST}${REPO_URL}${ESC}]8;;${ST}`);
    expect(visible(on)).toBe(REPO_URL);
    expect(link(REPO_URL, false)).toBe(REPO_URL);
    expect(visible(starLine(true))).toBe(visible(starLine(false)));
  });
});

describe("where the GitHub link appears", () => {
  it("--help ends with docs & issues and the vendor", () => {
    const text = helpText("1.1.0-beta.2");
    expect(text.trimEnd().endsWith(`Docs & issues: ${REPO_URL}\nBy Creative Code Logic · https://creativecodelogic.com`)).toBe(true);
    expect(visible(helpText("1.1.0-beta.2", false, true))).toContain(helpFooter(false));
  });

  it("unexpected errors ask for a report with --doctor output", () => {
    expect(reportBugLine(false)).toBe(`Please report this: ${ISSUES_URL} — include \`ccl-caut --doctor\` output`);
  });

  it("the star line text", () => {
    expect(visible(starLine(false))).toBe("Enjoying CCL CAUT? ⭐ Star it on GitHub: github.com/CreativeCodeLogic/ccl-cli-agents-update-tool");
  });
});

describe("star line: once per version, interactive runs only", () => {
  const base = { version: "1.1.0-beta.2", lastShown: null as string | null, interactive: true, isTTY: true, env: {}, demo: false };
  it("shows once, then again only for a new version", () => {
    expect(shouldShowStar(base)).toBe(true);
    expect(shouldShowStar({ ...base, lastShown: "1.1.0-beta.2" })).toBe(false);
    expect(shouldShowStar({ ...base, lastShown: "1.1.0-beta.1" })).toBe(true);
  });
  it("never for --yes / machine modes, pipes, CI or the demo", () => {
    expect(shouldShowStar({ ...base, interactive: false })).toBe(false);
    expect(shouldShowStar({ ...base, isTTY: false })).toBe(false);
    expect(shouldShowStar({ ...base, env: { CI: "true" } })).toBe(false);
    expect(shouldShowStar({ ...base, demo: true })).toBe(false);
  });

  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  it("remembers the version in the config as an extra key 1.0.x ignores (and --reset-selection keeps it)", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ccl-caut-star-"));
    dirs.push(dir);
    const host: Host = { ...getHost(), homedir: dir, env: { APPDATA: dir, XDG_CONFIG_HOME: dir } };
    const config = UserConfig.load(host);
    config.saveChoices({ codex: "update" }, host);
    config.markStarShown("1.1.0-beta.2", host);
    const file = path.join(dir, "ccl-caut", "config.json");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ schema: 1, tools: { codex: "update" }, starShownVersion: "1.1.0-beta.2" });
    expect(UserConfig.load(host).starShownVersion).toBe("1.1.0-beta.2");
    UserConfig.load(host).reset(host);
    expect(UserConfig.load(host).starShownVersion).toBe("1.1.0-beta.2");
  });
});

describe("absent in machine modes (real process, piped)", () => {
  const require = createRequire(import.meta.url);
  const tsx = require.resolve("tsx/cli");
  const run = (args: string[]) =>
    spawnSync(process.execPath, [tsx, "src/index.ts", ...args], { encoding: "utf8", env: { ...process.env, CI: "", NO_COLOR: "1", WT_SESSION: "x" }, timeout: 60_000 });
  it.each([[["--demo", "--json"]], [["--demo", "--check"]], [["--demo", "--yes"]], [["--version"]]])("%j prints no star line and no hyperlink codes", (args) => {
    const res = run(args);
    expect(res.stdout + res.stderr).not.toContain("Star it on GitHub");
    expect(res.stdout + res.stderr).not.toContain(`${ESC}]8;;`);
  }, 60_000);
});
