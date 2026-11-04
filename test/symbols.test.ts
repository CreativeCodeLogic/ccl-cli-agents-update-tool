import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { S_BAR, S_BAR_END, S_BAR_START, S_ERROR, S_INFO, S_RADIO_ACTIVE, S_RADIO_INACTIVE, S_STEP_ACTIVE, S_STEP_CANCEL, S_STEP_ERROR, S_STEP_SUBMIT, S_SUCCESS, S_WARN, unicodeOr } from "@clack/prompts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolScan } from "../src/types";
import { frameSet, iconSet, icons, isUnicodeSupported, spinnerFrames } from "../src/ui/symbols";

const ANSI = new RegExp(String.fromCharCode(27) + "\[[0-9;]*m", "g");
const strip = (s: string) => s.replace(ANSI, "");

const row = (id: string, state: ToolScan["state"]): ToolScan => ({
  id, name: id, shortName: id, group: "agents", docsUrl: "", installed: true, installMethod: "npm", binaryPath: `/bin/${id}`,
  installedVersion: "1.0.0", latestVersion: "1.0.0", latestStaleCachedAt: null, state, updateAvailable: false,
  needsAdmin: false, plan: null, shadowed: [], deprecation: null, notes: [], projectPin: null, compatibility: null, waitingFor: null, broken: null,
});

/** Classic Windows console: none of the variables modern terminals set. */
const CONHOST = { WT_SESSION: "", TERM_PROGRAM: "", TERM: "", CI: "", TERMINUS_SUBLIME: "", ConEmuTask: "", TERMINAL_EMULATOR: "" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("status symbols", () => {
  it("decide Unicode the same way clack does for its own symbols", () => {
    expect(isUnicodeSupported()).toBe(unicodeOr("u", "a") === "u");
  });

  it("use fallbacks only in classic consoles", () => {
    expect(isUnicodeSupported(CONHOST, "win32")).toBe(false);
    expect(isUnicodeSupported({ ...CONHOST, WT_SESSION: "abc" }, "win32")).toBe(true); // Windows Terminal
    expect(isUnicodeSupported({ ...CONHOST, TERM_PROGRAM: "vscode" }, "win32")).toBe(true);
    expect(isUnicodeSupported({ ...CONHOST, CI: "true" }, "win32")).toBe(true);
    expect(isUnicodeSupported({ TERM: "xterm-256color" }, "linux")).toBe(true);
    expect(isUnicodeSupported({ TERM: "linux" }, "linux")).toBe(false); // kernel console
    expect(iconSet(false)).toMatchObject({ ok: "√", update: "^", retired: "x", selfUpdating: "~", fail: "x", rule: "-", unknown: "?" });
    expect(iconSet(true)).toMatchObject({ ok: "✓", update: "↑", retired: "⊘", selfUpdating: "↻", fail: "✗", rule: "─", unknown: "?" });
  });

  it("renders the table with fallback glyphs in a simulated conhost", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      for (const [k, v] of Object.entries(CONHOST)) vi.stubEnv(k, v);
      vi.resetModules();
      const { renderTable } = await import("../src/ui/table");
      const { icons: conhostIcons } = await import("../src/ui/symbols");
      expect(conhostIcons.ok).toBe("√");
      const text = strip(renderTable([row("claude", "up-to-date"), row("codex", "outdated"), row("gemini", "retired"), row("cursor", "self-updating"), row("x", "unknown")]));
      const lines = text.split("\n");
      expect(lines[1]).toMatch(/^ {2}-+$/); // the rule
      expect(text).toContain("√  claude");
      expect(text).toContain("^  codex");
      expect(text).toContain("x  gemini");
      expect(text).toContain("~  cursor");
      expect(text).toContain("?  x");
      expect(text).not.toMatch(/[✓↑⊘↻─]/);
    } finally {
      Object.defineProperty(process, "platform", platform);
    }
  });

  it("this terminal's icons are what the UI uses", () => {
    expect(icons).toEqual(iconSet(isUnicodeSupported()));
  });
});

// Emoji (any presentation) and Emoji_Presentation. \p{Emoji} also covers 0-9, # and *, so ASCII is skipped.
const emojiChars = (text: string) => [...text].filter((c) => c.codePointAt(0)! > 0x7f && (/\p{Emoji}/u.test(c) || /\p{Emoji_Presentation}/u.test(c)));
const hex = (c: string) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} ${c}`;

describe("no emoji glyphs", () => {
  it("knows the glyph that started this: U+2714 has the Emoji property without emoji presentation", () => {
    expect(emojiChars("✔✖◻◼").map(hex)).toEqual(["U+2714 ✔", "U+2716 ✖", "U+25FB ◻", "U+25FC ◼"]);
    expect(emojiChars("✓✗□■")).toEqual([]);
  });

  it("no symbol CCL CAUT draws has default emoji presentation or the Emoji property", () => {
    const ours = [...Object.values(iconSet(true)), ...Object.values(frameSet(true)), ...spinnerFrames(true)];
    // clack's symbols that CCL CAUT's prompts and log lines show.
    const clack = [S_BAR, S_BAR_END, S_BAR_START, S_ERROR, S_INFO, S_RADIO_ACTIVE, S_RADIO_INACTIVE, S_STEP_ACTIVE, S_STEP_CANCEL, S_STEP_ERROR, S_STEP_SUBMIT, S_SUCCESS, S_WARN];
    expect(emojiChars([...ours, ...clack].join("")).map(hex)).toEqual([]);
  });

  it("no source file uses an emoji glyph (except the deliberate star line and the demo's sample notes)", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts")) files.push(p);
      }
    };
    walk(join(__dirname, "..", "src"));
    const found = files
      .filter((f) => !/[\\/]demo[\\/]notes\.ts$/.test(f)) // made-up notes with emoji, to show the popup handles them
      .flatMap((f) => {
        // Comments may name the glyphs we avoid; only code counts.
        const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
        const text = code.replace(/\\u\{?([0-9A-Fa-f]{4,5})\}?/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
        return emojiChars(text.replace("⭐ Star it on GitHub", "")).map((c) => `${f.replace(/.*[\\/]src[\\/]/, "src/")}: ${hex(c)}`);
      });
    expect(found).toEqual([]);
  });
});
