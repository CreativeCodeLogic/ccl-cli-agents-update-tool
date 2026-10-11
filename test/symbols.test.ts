import { unicodeOr } from "@clack/prompts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolScan } from "../src/types";
import { iconSet, icons, isUnicodeSupported } from "../src/ui/symbols";

const ANSI = new RegExp(String.fromCharCode(27) + "\[[0-9;]*m", "g");
const strip = (s: string) => s.replace(ANSI, "");

const row = (id: string, state: ToolScan["state"]): ToolScan => ({
  id, name: id, shortName: id, group: "agents", docsUrl: "", installed: true, installMethod: "npm", binaryPath: `/bin/${id}`,
  installedVersion: "1.0.0", latestVersion: "1.0.0", latestStaleCachedAt: null, state, updateAvailable: false,
  needsAdmin: false, plan: null, shadowed: [], deprecation: null, notes: [], projectPin: null,
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
    expect(iconSet(true)).toMatchObject({ ok: "✔", update: "↑", retired: "⊘", selfUpdating: "↻", fail: "✖", rule: "─", unknown: "?" });
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
      expect(text).not.toMatch(/[✔↑⊘↻─]/);
    } finally {
      Object.defineProperty(process, "platform", platform);
    }
  });

  it("this terminal's icons are what the UI uses", () => {
    expect(icons).toEqual(iconSet(isUnicodeSupported()));
  });
});
