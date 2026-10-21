import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { PassThrough, Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { DEMO_NOTICE, demoBlock, demoPromptLines, setDemoMode, wrapWords } from "../src/ui/demo-notice";
import { checklist, choose, QUIT } from "../src/ui/prompts";

const require = createRequire(import.meta.url);
const ESC = String.fromCharCode(27);

/** Feed keys into a real prompt and capture everything it draws. */
function io(...sequence: string[]) {
  const input = new PassThrough();
  let drawn = "";
  const output = new Writable({
    write: (chunk, _e, cb) => {
      drawn += String(chunk);
      cb();
    },
  });
  setTimeout(async () => {
    for (const k of sequence) {
      input.write(k);
      await new Promise((r) => setTimeout(r, 15));
    }
  }, 20);
  return { input, output, drawn: () => stripVTControlCharacters(drawn) };
}

function run(args: string[]) {
  const tsx = require.resolve("tsx/cli");
  const env: NodeJS.ProcessEnv = { ...process.env, CI: "" };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  const res = spawnSync(process.execPath, [tsx, "src/index.ts", ...args], { encoding: "utf8", input: "", env, timeout: 60_000 });
  return { ...res, out: `${res.stdout}${res.stderr}` };
}

afterEach(() => setDemoMode(false));

describe("the demo notice", () => {
  it("has the exact wording, wrapped to the terminal", () => {
    expect(wrapWords(DEMO_NOTICE, 100).join(" ")).toBe(DEMO_NOTICE);
    expect(DEMO_NOTICE).toBe("DEMO MODE: sample data only. Nothing on this computer is installed, updated or changed. Tool names and versions are made up for the demo.");
    for (const line of wrapWords(DEMO_NOTICE, 40)) expect(line.length).toBeLessThanOrEqual(40);
  });

  it("ASCII block: a line of = above and below, readable without colors (classic consoles, --no-color)", () => {
    const block = demoBlock(100).map((l) => stripVTControlCharacters(l));
    expect(block[0]).toMatch(/^=+$/);
    expect(block.at(-1)).toMatch(/^=+$/);
    expect(block.slice(1, -1).join(" ").replace(/\s+/g, " ").trim()).toBe(DEMO_NOTICE);
    expect(block.join("")).toMatch(/^[\x20-\x7e]*$/); // plain ASCII
  });

  it("prompt lines carry the whole notice", () => {
    expect(demoPromptLines(100).map((l) => stripVTControlCharacters(l).replace(/^!! /, "").trim()).join(" ")).toBe(DEMO_NOTICE);
  });
});

describe("every demo prompt shows the notice at its top and bottom", () => {
  const options = [
    { value: "codex", label: "Codex CLI" },
    { value: "kimi", label: "Kimi Code" },
  ];

  it("checklist and choose, in demo mode", async () => {
    setDemoMode(true);
    for (const ask of [
      (k: ReturnType<typeof io>) => checklist({ message: "Select the CLIs to update", options, initialValues: [], ...k }),
      (k: ReturnType<typeof io>) => choose({ message: "What next?", options, ...k }),
    ]) {
      const k = io("q");
      expect(await ask(k)).toBe(QUIT);
      const screen = k.drawn();
      const first = screen.indexOf("DEMO MODE");
      const keys = screen.indexOf("enter confirm");
      expect(first).toBeGreaterThan(screen.indexOf("?") === -1 ? screen.indexOf("Select") : 0);
      // One notice right under the question, one right above the key hints.
      expect(screen.slice(0, keys).split("DEMO MODE").length - 1).toBe(2);
    }
  });

  it("never outside demo mode", async () => {
    const k = io("q");
    await choose({ message: "What next?", options, ...k });
    expect(k.drawn()).not.toContain("DEMO MODE");
  });
});

describe("demo runs (no terminal)", () => {
  it("--demo --yes: the notice is the first and the last thing, and each update is (simulated)", () => {
    const { out } = run(["--demo", "--yes"]);
    const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(lines.slice(0, 3).join(" ")).toContain("DEMO MODE: sample data only.");
    expect(lines.slice(-4).join(" ")).toContain("DEMO MODE: sample data only.");
    expect(out).toMatch(/Aider 0\.86\.1 .+ 0\.86\.2 \(simulated\)/); // Codex is "running" in the demo, so --yes skips it
    expect(out).not.toContain(ESC);
  }, 70_000);

  it("--demo --json: pure JSON with \"demo\": true, no notice", () => {
    const { stdout } = run(["--demo", "--json"]);
    expect(JSON.parse(stdout).demo).toBe(true);
    expect(stdout).not.toContain("DEMO MODE");
  }, 70_000);

  it("never in a real run", () => {
    const { out, status } = run(["--help"]);
    expect(status).toBe(0);
    expect(out).not.toContain("DEMO MODE");
  }, 70_000);
});