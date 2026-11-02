import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const home = mkdtempSync(join(tmpdir(), "ccl-caut-whatsnew-"));
afterAll(() => rmSync(home, { recursive: true, force: true }));

/**
 * The CLI as a process. Config and cache go to a temp folder; `offline` routes
 * every request to a closed port (a refused proxy), so nothing reaches the network.
 */
function run(args: string[], offline = false) {
  const env: NodeJS.ProcessEnv = { ...process.env, CI: "", APPDATA: home, LOCALAPPDATA: home, XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, HOME: home };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  if (offline) {
    for (const k of ["NO_PROXY", "no_proxy", "GITHUB_TOKEN", "GH_TOKEN"]) delete env[k];
    Object.assign(env, { HTTPS_PROXY: "http://127.0.0.1:9", HTTP_PROXY: "http://127.0.0.1:9" });
  }
  const res = spawnSync(process.execPath, [require.resolve("tsx/cli"), "src/index.ts", ...args], { encoding: "utf8", input: "", env, timeout: 90_000 });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

describe("--whats-new <tool> (no prompt)", () => {
  it("exit 0: the notes, plain and sanitized, then the official link", () => {
    const { status, stdout } = run(["--demo", "--whats-new", "codex"]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^What's new in Codex CLI \S+\n/);
    expect(stdout).toContain("Official notes: ");
    expect(stdout).not.toContain("\u001b[");
  }, 100_000);

  it("--json: the result with the mapping as a format (for the canary)", () => {
    const { status, stdout } = run(["--demo", "--whats-new", "codex", "--json"]);
    expect(status).toBe(0);
    const json = JSON.parse(stdout);
    expect(json).toMatchObject({ id: "codex", state: "ready", source: { kind: "github-release", repo: "openai/codex", tagFormat: "rust-v<version>" } });
  }, 100_000);

  it("exit 2: an unknown id, with the valid ids listed", () => {
    const { status, stderr } = run(["--demo", "--whats-new", "codx"]);
    expect(status).toBe(2);
    expect(stderr).toContain('unknown tool "codx". Valid ids: ');
    expect(stderr).toContain("ccl-caut");
    expect(stderr).toContain("codex");
  }, 100_000);

  it("exit 1: no notes to show (a web page only, or nothing could be fetched)", () => {
    const amp = run(["--whats-new", "amp"], true);
    expect(amp.status).toBe(1);
    expect(amp.stdout).toContain("Amp publishes its release notes on the web only.");
    expect(amp.stdout).toContain("Official notes: https://ampcode.com/news");
    const gh = run(["--whats-new", "gh"], true);
    expect(gh.status).toBe(1);
    expect(gh.stdout).toContain("Official notes: https://github.com/cli/cli/releases");
  }, 200_000);
});
