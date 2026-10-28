import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { renderPending, type PendingItem } from "../src/pending";
import { LiveStatus, statusLine } from "../src/ui/live";
import { wrapForGutter } from "../src/ui/log";
import { renderTable } from "../src/ui/table";
import { finalState, OutputTracker } from "../src/ui/update";
import { displayWidth, isCommandLine, wrapWords } from "../src/ui/width";
import { keepTerminalTitle, releaseTerminalTitle, restoreTerminalTitle, type TitleHost } from "../src/utils/title";
import type { ToolScan } from "../src/types";

const WIDTHS = [60, 80, 95, 120];
const GUTTER = 3;

// The messages that used to run off the edge (and lose the "│" gutter when the terminal wrapped them).
const MESSAGES: Record<string, string> = {
  retired: "gemini: retired for consumer accounts since Jun 2026 -> use Antigravity CLI (agy).\nStill works with enterprise licenses / paid API keys.",
  preflight: "Close agent sessions and IDEs or terminals using these tools (VS Code, etc.) first, or they may keep the old version loaded until they restart.",
  admin: "needs admin = run ccl-caut from a terminal opened with Run as administrator",
  manualReason: "Installed under a different Node.js/npm prefix (version manager?); run this with that Node version active. On npm 12 or later add --allow-scripts=@anthropic-ai/claude-code (its install script puts the native claude binary in place).",
  projectNote: "wrangler: This project pins wrangler ^4.149.0 (devDependencies; 4.148.0 in node_modules).\nUpdating the global copy won't affect it; use `npx wrangler` here.",
  skipped: "npm skipped these install scripts (Netlify CLI starts without them): netlify-cli, esbuild, unix-dgram",
  broken: "npm blocked @anthropic-ai/claude-code (postinstall: node install.cjs), which the tool needs to run. This allows that package only:",
  cjk: "kimi: 新版本已发布，请更新到最新版本以获得最佳体验和最新功能 (Kimi Code 2.3.3) — see https://moonshotai.github.io/kimi-code/changelog for details",
  url: "wrangler: Cloudflare recommends installing Wrangler per project (npm i -D wrangler). https://developers.cloudflare.com/workers/wrangler/install-and-update/",
};

const words = (text: string) => stripVTControlCharacters(text).split(/\s+/).filter(Boolean);

describe("long messages are word-wrapped to the window (gutter and indent kept by clack)", () => {
  for (const width of WIDTHS) {
    for (const [kind, message] of Object.entries(MESSAGES)) {
      it(`${kind} at ${width} columns`, () => {
        const lines = wrapForGutter(message, width).split("\n");
        for (const line of lines) {
          const w = displayWidth(line);
          // Only an unbreakable token (a URL) may be longer than the room, alone on its line.
          if (w > width - GUTTER) expect(words(line)).toHaveLength(1);
        }
        // No word was cut in two: the same words, in the same order.
        expect(lines.flatMap(words)).toEqual(words(message));
      });
    }
  }

  it("a `backticked command` and a trailing command after a colon are never split", () => {
    const amp = "amp: Installed from the old npm name @sourcegraph/amp, now an alias of @ampcode/cli. Switch to the install script or @ampcode/cli: npm uninstall -g @sourcegraph/amp && npm install -g @ampcode/cli@latest";
    const lines = wrapForGutter(amp, 60).split("\n");
    expect(lines.at(-1)).toBe("npm uninstall -g @sourcegraph/amp && npm install -g @ampcode/cli@latest");
    expect(wrapForGutter("Updating the global copy won't affect it; use `npx wrangler deploy --env production` here.", 40)).toContain("`npx wrangler deploy --env production`");
  });

  it("colors don't leak into the next line's gutter: a style is closed and reopened", () => {
    const yellow = "\u001b[33m";
    const lines = wrapForGutter(`${yellow}${"word ".repeat(30).trim()}\u001b[39m`, 40).split("\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines.slice(0, -1)) expect(line.endsWith("\u001b[0m")).toBe(true);
    for (const line of lines.slice(1)) expect(line.startsWith(yellow)).toBe(true);
  });
});

describe("commands users copy are never wrapped by us", () => {
  const command = "npm install -g --ignore-scripts=false --allow-scripts=regex-utilities,@anthropic-ai/claude-code @anthropic-ai/claude-code@latest";

  it("a command line inside a message stays one line at every width", () => {
    expect(isCommandLine(command)).toBe(true);
    expect(isCommandLine("npm skipped these install scripts: esbuild")).toBe(false);
    for (const width of WIDTHS) expect(wrapForGutter(`Your npm config turns install scripts off.\n${command}`, width).split("\n")).toContain(command);
  });

  it("the Still to do block prints each command as one line", () => {
    const item: PendingItem = { id: "claude", name: "Claude Code", command, reason: "", needsAdmin: false, shell: "any", status: "broken" };
    expect(stripVTControlCharacters(renderPending([item])).split("\n")).toContain(command);
  });
});

describe("the table fits the window instead of wrapping rows", () => {
  const scan = (over: Partial<ToolScan>): ToolScan =>
    ({
      id: "x", name: "X", shortName: "X", group: "dev", docsUrl: "", installed: true, installMethod: "npm", binaryPath: "/x", installedVersion: "1.0.0", latestVersion: "1.0.1",
      latestStaleCachedAt: null, state: "outdated", updateAvailable: true, needsAdmin: false, plan: null, shadowed: [], deprecation: null, notes: [], projectPin: null,
      compatibility: null, waitingFor: null, broken: null, ...over,
    }) as ToolScan;
  const results = [
    scan({ id: "claude", name: "Claude Code", shortName: "Claude", group: "agents", installedVersion: "2.1.311", latestVersion: "2.1.312", needsAdmin: true }),
    scan({ id: "gemini", name: "Gemini CLI", shortName: "Gemini", group: "agents", state: "retired", installedVersion: "0.64.0", latestVersion: "0.66.0" }),
    scan({ id: "gcloud", name: "Google Cloud CLI", shortName: "gcloud", installMethod: "native", installedVersion: "590.0.1", latestVersion: "591.0.0", needsAdmin: true }),
    scan({ id: "npm", name: "npm", shortName: "npm", installMethod: "node", installedVersion: "11.19.0", latestVersion: "12.2.1", needsAdmin: true, shadowed: [{ path: "/y", installMethod: "npm", version: "12.2.1" }] }),
    scan({ id: "wrangler", name: "Wrangler", shortName: "Wrangler", installedVersion: "4.153.0", latestVersion: "4.154.0", latestStaleCachedAt: new Date(Date.now() - 9 * 3600_000).toISOString(), shadowed: [{ path: "/z", installMethod: "npm", version: "4.154.0" }] }),
  ];
  for (const width of [...WIDTHS, 40]) {
    it(`${width} columns`, () => {
      for (const line of renderTable(results, width - 1).split("\n")) expect(displayWidth(line)).toBeLessThan(width);
    });
  }
});

// What npm and other updaters print (recorded npm 12.2.1 output plus progress redraws).
const NPM_HTTP = readFileSync(join(__dirname, "fixtures", "npm12", "esbuild-blocked-http.txt"), "utf8");
const NOISY = [
  "⠙\r⠹\r⠸\r⠼ reify:netlify-cli: timing reifyNode:node_modules/netlify-cli Completed in 2210ms\r\n",
  "\u001b[2K\r\n",
  "\u001b[33m\u001b[39m\n",
  "   \t  \n",
  "npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.\n",
  "progress\t[=====>    ]\t55%\r",
  "progress\t[==========]\t100%\r\n",
  "安装完成：新版本的命令行工具已经准备就绪，可以开始使用了 ✅\n",
].join("");

class Screen extends Writable {
  text = "";
  constructor(public columns: number) {
    super();
  }
  readonly isTTY = true;
  override _write(chunk: Buffer, _enc: string, done: () => void) {
    this.text += String(chunk);
    done();
  }
}

describe("the live status takes a constant number of rows, however long and narrow", () => {
  it("\\r redraws count once, in their final state; escape-only and blank lines never become a line", () => {
    const t = new OutputTracker();
    t.feed(NOISY);
    t.end();
    const tail = t.tail(50);
    expect(tail).toContain("⠼ reify:netlify-cli: timing reifyNode:node_modules/netlify-cli Completed in 2210ms");
    expect(tail).toContain("progress  [==========]  100%");
    expect(tail.some((l) => l.includes("55%"))).toBe(false);
    expect(tail.every((l) => l.trim().length > 0)).toBe(true);
    expect(finalState("\u001b[2K\r")).toBe("");
  });

  for (const width of [60, 80, 95]) {
    it(`${width} columns: three rows per frame, each inside the window; each redraw erases exactly those rows`, () => {
      const out = new Screen(width);
      const live = new LiveStatus(`Updating \u001b[1mNetlify CLI\u001b[22m  \u001b[2m$ npm install -g --allow-scripts=regex-utilities,netlify-cli netlify-cli@latest\u001b[22m`, out as unknown as NodeJS.WriteStream);
      const t = new OutputTracker();
      live.start();
      for (const chunk of [NPM_HTTP, NOISY, NPM_HTTP]) {
        t.feed(chunk);
        live.update(t.latest, `${t.counter()} and 1234 more`);
        (live as unknown as { draw(): void }).draw();
        const frame = live.lines(width);
        expect(frame).toHaveLength(3);
        for (const line of frame) expect(displayWidth(line)).toBeLessThan(width);
      }
      live.stop();
      // Every erase goes up exactly the three rows the frame took.
      expect(out.text.match(/\u001b\[(\d+)A/g)?.every((m) => m === "\u001b[3A")).toBe(true);
    });
  }

  it("the time and counter stay readable; the title gives way", () => {
    const line = statusLine("◐", "Updating Netlify CLI  $ npm install -g netlify-cli@latest", "1:23 · fetched 1234 files", 59);
    expect(displayWidth(line)).toBeLessThanOrEqual(59);
    expect(stripVTControlCharacters(line)).toContain("1:23 · fetched 1234 files");
  });

  it("a window made narrower mid-update: the erase counts the rows the old lines now take", () => {
    const out = new Screen(120);
    const live = new LiveStatus("Updating Wrangler  $ npm install -g wrangler@latest", out as unknown as NodeJS.WriteStream);
    live.start();
    live.update("x".repeat(100), "fetched 12 files");
    (live as unknown as { draw(): void }).draw();
    const drawn = live.lines(120).map((l) => displayWidth(l));
    out.columns = 60;
    out.text = "";
    live.stop();
    // Each line drawn for 120 columns now takes ceil(width / 60) rows (the 100-column one: two).
    const rows = drawn.reduce((sum, w) => sum + Math.max(1, Math.ceil(w / 60)), 0);
    expect(rows).toBeGreaterThan(3);
    expect(out.text).toContain(`\u001b[${rows}A`);
  });
});

describe("the terminal title is put back after each child process (Windows)", () => {
  const host = (over: Partial<TitleHost> = {}) => {
    const calls: string[] = [];
    const h: TitleHost = { platform: "win32", isTTY: true, read: () => "Command Prompt - ccl-caut", set: (t) => void calls.push(`set ${t}`), write: (t) => void calls.push(`write ${JSON.stringify(t)}`), ...over };
    return { h, calls };
  };

  it("the original title comes back after a child renamed the console, and on exit", () => {
    const { h, calls } = host();
    expect(keepTerminalTitle(h)).toBe(true);
    restoreTerminalTitle();
    releaseTerminalTitle();
    expect(calls).toEqual(["set Command Prompt - ccl-caut", "set Command Prompt - ccl-caut"]);
  });

  it("the original can't be read: 'ccl-caut' while running, cleared on exit", () => {
    const { h, calls } = host({ read: () => "" });
    keepTerminalTitle(h);
    restoreTerminalTitle();
    releaseTerminalTitle();
    expect(calls).toEqual(["set ccl-caut", "set ccl-caut", 'write "\\u001b]0;\\u0007"']);
  });

  it("not a terminal, or not Windows: nothing is touched", () => {
    for (const over of [{ isTTY: false }, { platform: "linux" as const }]) {
      const { h, calls } = host(over);
      expect(keepTerminalTitle(h)).toBe(false);
      restoreTerminalTitle();
      releaseTerminalTitle();
      expect(calls).toEqual([]);
    }
  });
});

describe("wrapWords basics", () => {
  it("keeps the text's own line breaks and blank lines", () => {
    expect(wrapWords("a\n\nb", 20)).toEqual(["a", "", "b"]);
  });
});
