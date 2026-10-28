import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { leftOverPending, pendingForResults, withBroken, brokenPending } from "../src/pending";
import { claude } from "../src/registry/claude";
import { codex } from "../src/registry/codex";
import { npmInstallPlan } from "../src/registry/shared";
import { brokenNpmInstall } from "../src/scan";
import type { ToolScan } from "../src/types";
import { applyUpdates, type UpdateTarget } from "../src/ui/update";
import {
  blocksScriptsByDefault,
  installedPackageOf,
  npmRepairCommand,
  npmScriptArgs,
  parseBlockedScripts,
  parseNpmConfig,
  primeNpmScriptPolicy,
  supportsAllowScripts,
  type NpmScriptPolicy,
} from "../src/utils/npm-scripts";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", "npm12", name), "utf8");

// npm 12.2.1 on Windows, `npm install -g --prefix <tmp> esbuild@0.28.2` (recorded).
const ESBUILD = fixture("esbuild-blocked.txt");
// The same install as CCL CAUT runs it (--loglevel=http): fetch lines before the warning.
const ESBUILD_HTTP = fixture("esbuild-blocked-http.txt");
// The report that started this (npm 12.2.1, Windows 11), in npm's exact format.
const CLAUDE = [
  "npm http fetch GET 200 https://registry.npmjs.org/@anthropic-ai%2fclaude-code 412ms (cache revalidated)",
  "",
  "changed 2 packages in 6s",
  "npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:",
  "npm warn install-scripts   @anthropic-ai/claude-code@2.1.312 (postinstall: node install.cjs)",
  "npm warn install-scripts",
  "npm warn install-scripts Run `npm install -g --allow-scripts=@anthropic-ai/claude-code` to allow these scripts once, or `npm config set allow-scripts=@anthropic-ai/claude-code --location=user` to allow them for all global installs.",
  "",
].join("\r\n");

const npm12 = (over: Partial<NpmScriptPolicy> = {}): NpmScriptPolicy => ({ version: "12.2.1", allowScripts: [], ignoreScripts: false, allowAll: false, ...over });

describe("npm versions and the --allow-scripts flag", () => {
  it("the flag exists from npm 11.16.0; blocking by default from 12.0.0", () => {
    expect(supportsAllowScripts("11.15.0")).toBe(false);
    expect(supportsAllowScripts("11.16.0")).toBe(true);
    expect(supportsAllowScripts("12.2.1")).toBe(true);
    expect(supportsAllowScripts(null)).toBe(false);
    expect(blocksScriptsByDefault("11.21.1")).toBe(false);
    expect(blocksScriptsByDefault("12.0.0")).toBe(true);
    expect(blocksScriptsByDefault("12.0.0-pre.1")).toBe(true);
  });

  it("reads `npm config get allow-scripts ignore-scripts dangerously-allow-all-scripts` (recorded)", () => {
    expect(parseNpmConfig("allow-scripts=regex-utilities\nignore-scripts=false\ndangerously-allow-all-scripts=false\n")).toEqual({ allowScripts: ["regex-utilities"], ignoreScripts: false, allowAll: false });
    expect(parseNpmConfig("allow-scripts=\r\nignore-scripts=true\r\ndangerously-allow-all-scripts=false\r\n")).toEqual({ allowScripts: [], ignoreScripts: true, allowAll: false });
    expect(parseNpmConfig("allow-scripts=sharp, canvas\nignore-scripts=false\ndangerously-allow-all-scripts=true")).toMatchObject({ allowScripts: ["sharp", "canvas"], allowAll: true });
  });
});

describe("npm install -g with install scripts", () => {
  it("npm 12: only the tool's own package, added to the user's own allow list (the flag replaces .npmrc's)", () => {
    expect(npmScriptArgs("@anthropic-ai/claude-code", "latest", npm12({ allowScripts: ["regex-utilities"] }))).toEqual({
      kind: "args",
      args: ["--allow-scripts=regex-utilities,@anthropic-ai/claude-code"],
    });
    expect(npmScriptArgs("@anthropic-ai/claude-code", "latest", npm12({ allowScripts: ["@anthropic-ai/claude-code"] }))).toEqual({ kind: "args", args: ["--allow-scripts=@anthropic-ai/claude-code"] });
  });

  it("packages that run without their script get no flag", () => {
    for (const pkg of ["@openai/codex", "netlify-cli", "wrangler", "@moonshot-ai/kimi-code", "cline", "npm"]) {
      expect(npmScriptArgs(pkg, "latest", npm12())).toEqual({ kind: "args", args: [] });
    }
  });

  it("old npm (before 11.16.0): never the flag (it only knows to warn about it)", () => {
    expect(npmScriptArgs("@anthropic-ai/claude-code", "latest", npm12({ version: "10.9.2" }))).toEqual({ kind: "args", args: [] });
    expect(npmScriptArgs("opencode-ai", "latest", npm12({ version: "11.15.0" }))).toEqual({ kind: "args", args: [] });
    expect(npmScriptArgs("opencode-ai", "latest", npm12({ version: null }))).toEqual({ kind: "args", args: [] });
  });

  it("the user turned scripts off (ignore-scripts=true): not overridden, a manual plan with the reason", async () => {
    const denied = npmScriptArgs("@anthropic-ai/claude-code", "latest", npm12({ ignoreScripts: true }));
    expect(denied).toMatchObject({ kind: "denied", command: "npm install -g --ignore-scripts=false --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code@latest" });
    expect(denied.kind === "denied" && denied.reason).toContain("ignore-scripts=true");
    primeNpmScriptPolicy(npm12({ ignoreScripts: true }));
    expect(await npmInstallPlan("@anthropic-ai/claude-code", "latest")).toMatchObject({ kind: "manual", command: denied.kind === "denied" ? denied.command : "" });
  });

  it("dangerously-allow-all-scripts: every script runs already, no flag", () => {
    expect(npmScriptArgs("@anthropic-ai/claude-code", "latest", npm12({ allowAll: true }))).toEqual({ kind: "args", args: [] });
  });

  it("the automatic plan carries the flag on npm 12 and not on old npm", async () => {
    primeNpmScriptPolicy(npm12());
    expect(await npmInstallPlan("@anthropic-ai/claude-code", "latest")).toEqual({ kind: "auto", command: ["npm", "install", "-g", "--allow-scripts=@anthropic-ai/claude-code", "@anthropic-ai/claude-code@latest"] });
    expect(await npmInstallPlan("@openai/codex", "latest")).toEqual({ kind: "auto", command: ["npm", "install", "-g", "@openai/codex@latest"] });
    primeNpmScriptPolicy(npm12({ version: "10.9.2" }));
    expect(await npmInstallPlan("@anthropic-ai/claude-code", "latest")).toEqual({ kind: "auto", command: ["npm", "install", "-g", "@anthropic-ai/claude-code@latest"] });
  });
});

describe("npm's blocked-scripts warning (recorded npm 12 output)", () => {
  it("lists the packages npm skipped, with their scripts", () => {
    expect(parseBlockedScripts(ESBUILD)).toEqual([{ pkg: "esbuild", version: "0.28.2", scripts: "postinstall: node install.js" }]);
    expect(parseBlockedScripts(ESBUILD_HTTP)).toEqual([{ pkg: "esbuild", version: "0.28.2", scripts: "postinstall: node install.js" }]);
    expect(parseBlockedScripts(CLAUDE)).toEqual([{ pkg: "@anthropic-ai/claude-code", version: "2.1.312", scripts: "postinstall: node install.cjs" }]);
  });

  it("npm 11.19's wording, several packages, and no warning at all", () => {
    const old = ["npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:", "npm warn install-scripts   esbuild@0.27.0 (postinstall: node install.js)", "npm warn install-scripts   workerd@1.20261023.1 (postinstall: node install.js)", "npm warn install-scripts", "npm warn install-scripts Run `npm install -g --allow-scripts=esbuild,workerd` ..."].join("\n");
    expect(parseBlockedScripts(old).map((b) => b.pkg)).toEqual(["esbuild", "workerd"]);
    expect(parseBlockedScripts("\nchanged 1 package in 3s\n")).toEqual([]);
  });

  it("the installed package of an npm command", () => {
    expect(installedPackageOf(["install", "-g", "--allow-scripts=a,b", "@anthropic-ai/claude-code@latest"])).toBe("@anthropic-ai/claude-code");
    expect(installedPackageOf(["install", "-g", "wrangler@latest", "--loglevel=http"])).toBe("wrangler");
  });

  it("repair: the own package when npm blocked it, else the blocked dependencies (minimal allow), keeping the user's list", () => {
    const own = npmRepairCommand("@anthropic-ai/claude-code", parseBlockedScripts(CLAUDE), npm12({ allowScripts: ["regex-utilities"] }));
    expect(own.command).toBe("npm install -g --allow-scripts=regex-utilities,@anthropic-ai/claude-code @anthropic-ai/claude-code@latest");
    expect(own.reason).toContain("@anthropic-ai/claude-code (postinstall: node install.cjs)");
    expect(npmRepairCommand("wrangler", [{ pkg: "esbuild", version: "0.28.2", scripts: "postinstall: node install.js" }, { pkg: "workerd", version: "1", scripts: "postinstall: node install.js" }], npm12()).command).toBe(
      "npm install -g --allow-scripts=esbuild,workerd wrangler@latest",
    );
    expect(npmRepairCommand("@anthropic-ai/claude-code", [], npm12({ ignoreScripts: true })).command).toBe("npm install -g --ignore-scripts=false --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code@latest");
    expect(npmRepairCommand("@anthropic-ai/claude-code", [], npm12({ version: "10.9.2" })).command).toBe("npm install -g @anthropic-ai/claude-code@latest");
  });
});

describe("after an npm update: BROKEN, never 'unchanged'", () => {
  const target = (tool = claude, pkg = "@anthropic-ai/claude-code", version: () => Promise<string | null> = async () => "2.1.312"): UpdateTarget =>
    ({
      scan: { id: tool.id, name: tool.name, installedVersion: "2.1.311", latestVersion: "2.1.312", state: "outdated", needsAdmin: false, plan: { kind: "auto", command: ["npm", "install", "-g", `${pkg}@latest`] } },
      tool: { ...tool, getInstalledVersion: version },
      instance: { path: "C:/npm/claude.cmd", realPath: "C:/npm/node_modules/x", installMethod: "npm" },
    }) as unknown as UpdateTarget;

  it("npm skipped the tool's own script (its package.json says the new version): BROKEN with the repair command", async () => {
    primeNpmScriptPolicy(npm12({ allowScripts: ["regex-utilities"] }));
    const t = target();
    const outcome = await applyUpdates([t], null, async () => ({ code: 0, output: CLAUDE }), async () => false);
    expect(outcome).toMatchObject({ updated: 0, unchanged: 0, failed: 1, failedIds: ["claude"] });
    expect(outcome.repairs.get("claude")?.command).toBe("npm install -g --allow-scripts=regex-utilities,@anthropic-ai/claude-code @anthropic-ai/claude-code@latest");
    const [item] = leftOverPending([t.scan], outcome);
    expect(item).toMatchObject({ id: "claude", status: "broken", command: "npm install -g --allow-scripts=regex-utilities,@anthropic-ai/claude-code @anthropic-ai/claude-code@latest" });
  });

  it("no warning, but the command doesn't start and reports no version: BROKEN", async () => {
    primeNpmScriptPolicy(npm12());
    const outcome = await applyUpdates([target(claude, "@anthropic-ai/claude-code", vi.fn(async () => null))], null, async () => ({ code: 0, output: "changed 2 packages in 4s" }), async () => false);
    expect(outcome).toMatchObject({ failed: 1, unchanged: 0 });
  });

  it("only dependencies were skipped and the tool runs: updated (with a note)", async () => {
    const outcome = await applyUpdates([target(codex, "@openai/codex", vi.fn(async () => "0.165.0"))], null, async () => ({ code: 0, output: ESBUILD_HTTP }), async () => true);
    expect(outcome).toMatchObject({ updated: 1, failed: 0 });
  });

  it("the tool's own script was skipped but isn't needed (Netlify: shell completion), and it starts: updated", async () => {
    const netlify = (await import("../src/registry/netlify")).netlify;
    const output = ["changed 1 package in 30s", "npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:", "npm warn install-scripts   netlify-cli@27.15.0 (postinstall: node ./scripts/postinstall.js)", "npm warn install-scripts"].join("\n");
    const probe = vi.fn(async () => true);
    const outcome = await applyUpdates([target(netlify, "netlify-cli", async () => "27.15.0")], null, async () => ({ code: 0, output }), probe);
    expect(outcome).toMatchObject({ updated: 1, failed: 0 });
    expect(probe).toHaveBeenCalled();
    // ...and when it doesn't start, it is broken.
    const broken = await applyUpdates([target(netlify, "netlify-cli", async () => "27.15.0")], null, async () => ({ code: 0, output }), async () => false);
    expect(broken).toMatchObject({ failed: 1 });
  });

  it("old npm (no warning) and the tool runs: updated as before, no probe needed", async () => {
    const probe = vi.fn(async () => true);
    const outcome = await applyUpdates([target(codex, "@openai/codex", vi.fn(async () => "0.165.0"))], null, async () => ({ code: 0, output: "changed 1 package in 3s" }), probe);
    expect(outcome).toMatchObject({ updated: 1 });
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("at scan time: an npm install whose command doesn't start", () => {
  const active = { path: "C:/npm/claude.cmd", realPath: "C:/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe", installMethod: "npm" as const };
  const plan = { kind: "auto" as const, command: ["npm", "install", "-g", "--allow-scripts=@anthropic-ai/claude-code", "@anthropic-ai/claude-code@latest"] };

  it("the placeholder claude.exe: broken, with the repair command", async () => {
    primeNpmScriptPolicy(npm12());
    const broken = await brokenNpmInstall(claude, active, plan, async () => false);
    expect(broken).toEqual({ command: "npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code@latest", reason: expect.stringContaining("doesn't run") });
  });

  it("it starts (the version just wasn't readable): not broken", async () => {
    expect(await brokenNpmInstall(claude, active, plan, async () => true)).toBeNull();
  });

  it("broken tools are always in Still to do and --json's pending, even when not selected", () => {
    const scan = { id: "claude", name: "Claude Code", group: "agents", needsAdmin: false, state: "unknown", updateAvailable: false, plan, broken: { command: "npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code@latest", reason: "Claude Code is installed with npm but doesn't run." } } as unknown as ToolScan;
    const pending = pendingForResults([scan], {}, ["agents"]);
    expect(pending).toEqual([expect.objectContaining({ id: "claude", status: "broken", command: scan.broken!.command })]);
    expect(withBroken(brokenPending([scan]), [{ id: "claude", name: "Claude Code", command: "other", reason: "", needsAdmin: false, shell: "any" }])).toHaveLength(1);
  });
});
