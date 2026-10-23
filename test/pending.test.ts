import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import {
  autoCommandLine,
  collectPending,
  leftOverPending,
  pendingForResults,
  pendingForSelection,
  renderPending,
  shellOf,
} from "../src/pending";
import type { ToolScan, UpdatePlan } from "../src/types";

const require = createRequire(import.meta.url);
const ESC = String.fromCharCode(27);
const GROUPS = ["agents", "dev"] as const;

function scan(id: string, plan: UpdatePlan | null, overrides: Partial<ToolScan> = {}): ToolScan {
  return {
    id, name: id.toUpperCase(), shortName: id, group: "agents", docsUrl: "", installed: true, installMethod: "npm",
    binaryPath: `/bin/${id}`, installedVersion: "1.0.0", latestVersion: "1.1.0", latestStaleCachedAt: null,
    state: "outdated", updateAvailable: true, needsAdmin: false, plan, shadowed: [], deprecation: null,
    notes: [], projectPin: null, compatibility: null, waitingFor: null, ...overrides,
  };
}
const manual = (command: string, extra: Partial<Extract<UpdatePlan, { kind: "manual" }>> = {}): UpdatePlan => ({ kind: "manual", command, reason: "because", ...extra });
const auto = (...command: string[]): UpdatePlan => ({ kind: "auto", command });

const gcloud = scan("gcloud", manual("sudo apt-get update && sudo apt-get install --only-upgrade google-cloud-cli"), { group: "dev", needsAdmin: true, name: "Google Cloud CLI" });
const kimi = scan("kimi", manual("irm https://code.kimi.com/kimi-code/install.ps1 | iex"), { name: "Kimi Code" });
const codex = scan("codex", auto("npm", "install", "-g", "@openai/codex@latest"), { name: "Codex CLI" });
const vibe = scan("vibe", manual("uv tool upgrade --python 3.14 mistral-vibe"), { compatibility: "Mistral Vibe 3.0.0 needs Python >=3.14; your install uses Python 3.12." });
const opencode = scan("opencode", manual("winget upgrade --id SST.opencode --exact --source winget"), { compatibility: "waiting", waitingFor: "winget" });

describe("what goes on the list", () => {
  it("ticked tools with a command to copy (Python reinstalls count)", () => {
    expect(collectPending([gcloud, kimi, vibe]).map((p) => p.id)).toEqual(["gcloud", "kimi", "vibe"]);
  });

  it("automatic updates only when they failed or were skipped, with their command and why", () => {
    expect(collectPending([codex])).toEqual([]);
    const [item] = leftOverPending([codex], { interrupted: false, failedIds: ["codex"] });
    expect(item).toMatchObject({ id: "codex", command: "npm install -g @openai/codex@latest", status: "update failed" });
    const [skipped] = leftOverPending([codex], { interrupted: false, failedIds: [] }, new Map([["codex", "was running"]]));
    expect(skipped?.status).toBe("was running");
  });

  it("never: waiting for winget, unticked (not passed in), or anything after Ctrl+C", () => {
    expect(collectPending([opencode])).toEqual([]);
    expect(leftOverPending([gcloud, codex], { interrupted: true, failedIds: ["codex"] })).toEqual([]);
  });

  it("--pending / --json: the default selection, automatic updates that need admin, groups respected", () => {
    const adminAuto = scan("netlify", auto("npm", "install", "-g", "netlify-cli@latest"), { needsAdmin: true, group: "dev" });
    expect(pendingForSelection([codex, adminAuto]).map((p) => p.id)).toEqual(["netlify"]);
    expect(pendingForResults([gcloud, kimi, codex], {}, GROUPS).map((p) => p.id)).toEqual(["gcloud", "kimi"]);
    expect(pendingForResults([gcloud, kimi], { kimi: "skip" }, GROUPS).map((p) => p.id)).toEqual(["gcloud"]);
    expect(pendingForResults([gcloud, kimi], {}, ["agents"]).map((p) => p.id)).toEqual(["kimi"]);
  });

  it("a command that was run drops off the next --pending (the tool is up to date)", () => {
    expect(pendingForResults([gcloud], {}, GROUPS)).toHaveLength(1);
    const after = { ...gcloud, installedVersion: "1.1.0", state: "up-to-date" as const, updateAvailable: false };
    expect(pendingForResults([after], {}, GROUPS)).toEqual([]);
  });
});

describe("shells and command lines", () => {
  it("knows which shell a command needs", () => {
    expect(shellOf("irm https://x/install.ps1 | iex")).toBe("powershell");
    expect(shellOf("sudo snap refresh gh")).toBe("sh");
    expect(shellOf("curl -fsSL https://x/install.sh | bash")).toBe("sh");
    expect(shellOf("npm install -g x@latest")).toBe("any");
  });

  it("automatic commands become lines to type: executables by name, quoted when needed", () => {
    expect(autoCommandLine(["/home/dev/.local/bin/claude", "update"])).toBe("claude update");
    expect(autoCommandLine(["uv", "tool", "upgrade", "aider-chat"])).toBe("uv tool upgrade aider-chat");
    expect(autoCommandLine(["winget", "upgrade", "--id", "My App"])).toBe('winget upgrade --id "My App"');
  });
});

describe("the block", () => {
  it("nothing pending: nothing printed", () => {
    expect(renderPending([])).toBe("");
  });

  it("copy-safe: each command is a plain line (no codes, symbol or indent), context on a # line above", () => {
    const items = collectPending([gcloud, kimi]);
    const lines = renderPending(items).split("\n");
    for (const item of items) {
      const i = lines.indexOf(item.command);
      expect(i).toBeGreaterThan(0); // the exact line, nothing around it
      expect(lines[i]).not.toContain(ESC);
      expect(stripVTControlCharacters(lines[i - 1]!)).toMatch(/^# /);
    }
    const text = stripVTControlCharacters(renderPending(items));
    expect(text).toContain("# Google Cloud CLI (admin terminal)\nsudo apt-get update && sudo apt-get install --only-upgrade google-cloud-cli\n");
    expect(text).toContain("# Kimi Code (PowerShell)\nirm https://code.kimi.com/kimi-code/install.ps1 | iex\n");
    expect(text.startsWith("Still to do, run these yourself:\n")).toBe(true);
    expect(text.trimEnd().endsWith("Run ccl-caut --pending anytime to see what's left.")).toBe(true);
  });
});

function run(args: string[]) {
  const tsx = require.resolve("tsx/cli");
  const env: NodeJS.ProcessEnv = { ...process.env, CI: "" };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  const res = spawnSync(process.execPath, [tsx, "src/index.ts", ...args], { encoding: "utf8", input: "", env, timeout: 60_000 });
  return { status: res.status, out: `${res.stdout}${res.stderr}`, stdout: res.stdout };
}

describe("runs (demo, no terminal)", () => {
  it("--yes: the block comes after the summary, and only the demo notice after it", () => {
    const { out } = run(["--demo", "--yes"]);
    const block = out.indexOf("Still to do, run these yourself:");
    expect(block).toBeGreaterThan(out.indexOf("1 skipped"));
    expect(out.slice(block)).toContain("# Codex CLI (was running)\nnpm install -g @openai/codex@latest\n");
    expect(out.slice(block)).toContain("# Google Cloud CLI (admin terminal)\nsudo apt-get update && sudo apt-get install --only-upgrade google-cloud-cli\n");
    const tail = out.slice(out.indexOf("Run ccl-caut --pending anytime to see what's left.") + 50).trim();
    expect(tail.split("\n").every((l) => /^=+$|DEMO MODE|names and versions|^\s*$|or changed|Tool names/.test(l))).toBe(true);
  }, 70_000);

  it("--pending: exit 1 with something left, 0 with nothing; --pending --json is the list only", () => {
    const some = run(["--demo", "--pending"]);
    expect(some.status).toBe(1);
    expect(some.out).toContain("sudo apt-get update && sudo apt-get install --only-upgrade google-cloud-cli");
    expect(some.out).not.toContain("Tool  "); // no table
    expect(run(["--demo", "--pending", "--only", "agents"]).status).toBe(0);
    const json = run(["--demo", "--pending", "--json"]);
    expect(json.status).toBe(1);
    expect(JSON.parse(json.stdout)).toEqual([expect.objectContaining({ id: "gcloud", needsAdmin: true, shell: "sh" })]);
  }, 120_000);
});