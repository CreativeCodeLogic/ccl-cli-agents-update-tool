import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { splitUnattended } from "../src/processes";
import { discoverHint } from "../src/ui/discover";
import { updateExitCode } from "../src/ui/update";
import { childStdin, colorsOffForOutput } from "../src/utils/unattended";

const require = createRequire(import.meta.url);
const ESC = String.fromCharCode(27);

/** The environment of a scheduler: no CI, nothing forcing or disabling colors. */
function plainEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, CI: "" };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  return env;
}

describe("unattended runs: plain text", () => {
  it("turns colors off when stdout is not a terminal, on every platform", () => {
    expect(colorsOffForOutput({}, false, [])).toBe(true);
    expect(colorsOffForOutput({}, true, [])).toBe(false);
  });

  it("keeps colors in CI logs and when forced", () => {
    expect(colorsOffForOutput({ CI: "true" }, false, [])).toBe(false);
    expect(colorsOffForOutput({ FORCE_COLOR: "1" }, false, [])).toBe(false);
    expect(colorsOffForOutput({}, false, ["--color"])).toBe(false);
  });
});

describe("unattended runs: nothing waits for input", () => {
  it("gives update commands no stdin without a terminal", () => {
    expect(childStdin(false)).toBe("ignore");
    expect(childStdin(true)).toBe("inherit");
  });

  it("--yes skips automatic updates that need admin rights, with a reason", () => {
    const targets = [
      { id: "gcloud", claudeAuto: false, needsAdmin: true },
      { id: "codex", claudeAuto: false, needsAdmin: false },
    ];
    const { keep, skipped } = splitUnattended(targets, new Map(), false);
    expect(keep.map((t) => t.id)).toEqual(["codex"]);
    expect(skipped).toEqual([{ target: targets[0], reason: "needs-admin", processes: 0 }]);
  });

  it("a running tool is reported as running even if it also needs admin", () => {
    const targets = [{ id: "gcloud", claudeAuto: false, needsAdmin: true }];
    expect(splitUnattended(targets, new Map([["gcloud", 1]]), false).skipped[0]?.reason).toBe("running");
  });
});

describe("exit codes after updates", () => {
  const ok = { interrupted: false, failed: 0, unchanged: 0 };
  it("0 when everything applied, 1 when something failed, did not apply or was skipped", () => {
    expect(updateExitCode(ok, 0)).toBe(0);
    expect(updateExitCode({ ...ok, failed: 1 }, 0)).toBe(1);
    expect(updateExitCode({ ...ok, unchanged: 1 }, 0)).toBe(1);
    expect(updateExitCode(ok, 2)).toBe(1);
  });

  it("130 when interrupted", () => {
    expect(updateExitCode({ ...ok, interrupted: true, failed: 1 }, 1)).toBe(130);
  });
});

describe("the --discover hint", () => {
  it("shows while tools are missing, until --discover has been run once", () => {
    expect(discoverHint(10, 23, false)).toBe(" · ccl-caut --discover to see all");
    expect(discoverHint(10, 23, true)).toBe("");
    expect(discoverHint(23, 23, false)).toBe("");
  });

  it("running --discover stores discoverUsed in the user's config (real run, temp config folder)", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ccl-caut-discover-"));
    try {
      const tsx = require.resolve("tsx/cli");
      const res = spawnSync(process.execPath, [tsx, "src/index.ts", "--discover"], {
        encoding: "utf8",
        input: "",
        env: { ...process.env, APPDATA: dir, XDG_CONFIG_HOME: dir, CI: "" },
        timeout: 120_000,
      });
      expect(res.status).toBe(0);
      expect(JSON.parse(readFileSync(path.join(dir, "ccl-caut", "config.json"), "utf8"))).toEqual({ schema: 1, tools: {}, discoverUsed: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 130_000);
});

describe("a scheduled --yes run (demo, no terminal)", () => {
  it("never prompts, writes plain text, lists skipped tools and exits 1 for them", () => {
    const tsx = require.resolve("tsx/cli");
    const res = spawnSync(process.execPath, [tsx, "src/index.ts", "--demo", "--yes"], {
      encoding: "utf8",
      input: "",
      env: plainEnv(),
      timeout: 60_000,
    });
    const out = `${res.stdout}${res.stderr}`;
    expect(res.status).toBe(1);
    expect(out).not.toContain(ESC);
    expect(out).toContain("Skipping Codex CLI: it is running");
    expect(out).toMatch(/1 skipped/);
    expect(out).not.toContain("CCL CAUT v");
  }, 70_000);
});