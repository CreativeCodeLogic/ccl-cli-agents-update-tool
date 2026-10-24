import { EventEmitter } from "node:events";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { renderMarkdown, shortUrl, wrap } from "../src/whatsnew/markdown";
import { fitsPopup, inlineNotes, renderPopup, showNotes, type PopupContent } from "../src/whatsnew/popup";
import { sanitize } from "../src/whatsnew/sanitize";
import { displayWidth } from "../src/whatsnew/width";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const plain = (lines: string[]) => lines.map((l) => stripVTControlCharacters(l));

const content = (over: Partial<PopupContent> = {}): PopupContent => ({
  tool: "Codex CLI",
  version: "0.162.1",
  state: "ready",
  notes: "## 0.162.1\n\n- One\n- Two\n",
  link: "https://github.com/openai/codex/releases/tag/rust-v0.162.1",
  ...over,
});

describe("sanitizer: hostile notes render as harmless plain text", () => {
  it.each([
    ["title change (OSC 0)", `before${ESC}]0;pwned${BEL}after`, "beforeafter"],
    ["title change ended by ST", `a${ESC}]2;pwned${ESC}\\b`, "ab"],
    ["OSC 8 hyperlink", `${ESC}]8;;https://evil.example${ESC}\\click${ESC}]8;;${ESC}\\`, "click"],
    ["clear screen and cursor home", `x${ESC}[2J${ESC}[Hy`, "xy"],
    ["colors and cursor moves", `${ESC}[31mred${ESC}[0m ${ESC}[10A${ESC}[?25l`, "red "],
    ["8-bit CSI (C1)", "a\u009b2Jb", "ab"],
    ["8-bit OSC (C1)", "a\u009d0;pwned\u0007b", "ab"],
    ["DCS string", `a${ESC}Pq#0;2;0;0;0${ESC}\\b`, "ab"],
    ["two-character ESC codes (reset, keypad)", `a${ESC}cb${ESC}=c`, "abc"],
    ["bell, backspace and other C0", `a${BEL}b\u0008c\u0000d`, "abcd"],
    ["carriage return overwrite", "safe\rEVIL", "safe\nEVIL"],
    ["right-to-left override", "txt.\u202Eexe", "txt.exe"],
    ["bidi isolates", "\u2066abc\u2069 \u2067d\u2069", "abc d"],
  ])("%s", (_name, input, expected) => {
    expect(sanitize(input)).toBe(expected);
  });

  it("keeps newlines, tabs, CJK and emoji", () => {
    expect(sanitize("a\tb\n中文 🚀 ✨")).toBe("a\tb\n中文 🚀 ✨");
  });

  it("the popup never passes a hostile sequence through", () => {
    const evil = `## T${ESC}]0;pwned${BEL}\n- ${ESC}]8;;https://evil${ESC}\\x${ESC}]8;;${ESC}\\ ${ESC}[2J\u202Etxt`;
    const { lines } = renderPopup(content({ notes: evil, tool: `Evil${ESC}]0;t${BEL}` }), { cols: 100, rows: 30, ascii: false, scroll: 0 });
    const joined = lines.join("\n");
    expect(joined).not.toContain(`${ESC}]`);
    expect(joined).not.toContain(`${ESC}[2J`);
    expect(joined).not.toContain(BEL);
    expect(joined).not.toContain("\u202E");
    expect(joined).not.toContain("pwned");
  });
});

describe("display width", () => {
  it("CJK and emoji take two columns, combining marks none", () => {
    expect(displayWidth("abc")).toBe(3);
    expect(displayWidth("中文")).toBe(4);
    expect(displayWidth("日本語の")).toBe(8);
    expect(displayWidth("🚀")).toBe(2);
    expect(displayWidth("👨‍👩‍👧")).toBe(2);
    expect(displayWidth("é")).toBe(1); // e + combining acute
  });

  it("wrapping counts columns, also for CJK without spaces", () => {
    for (const line of wrap("支持更长的上下文窗口支持更长的上下文窗口支持更长的上下文窗口", 10)) expect(displayWidth(line)).toBeLessThanOrEqual(10);
  });
});

describe("Markdown rendering (text + width -> lines)", () => {
  const md = "# Title\n\nSome **bold** and `code`.\n\n- bullet one\n- bullet two that is long enough to wrap onto the next line\n1. first\n2. second\n\n> quoted\n\n[docs](https://www.example.com/docs/very/long/path/that/goes/on/and/on/forever)\n\n```\ncode line\n```\n\n<details>hidden html</details>";
  const lines = plain(renderMarkdown(md, { width: 40 }));

  it("headings, bullets, numbers, quotes, links as text + short URL, code, HTML dropped", () => {
    expect(lines[0]).toBe("Title");
    expect(lines).toContain("Some bold and code.");
    expect(lines).toContain("• bullet one");
    expect(lines).toContain("  onto the next line"); // hanging indent under the bullet text
    expect(lines).toContain("1. first");
    expect(lines).toContain("│ quoted");
    expect(plain(renderMarkdown("[docs](https://www.example.com/docs/very/long/path/that/goes/on/and/on/forever)", { width: 80 }))).toEqual(["docs (example.com/docs/very/long/path/that/go…)"]); // short URL: 40 columns at most
    expect(lines).toContain("  code line");
    expect(lines).toContain("hidden html");
    for (const l of lines) expect(displayWidth(l)).toBeLessThanOrEqual(40);
  });

  it("ASCII bullets", () => {
    expect(plain(renderMarkdown("- a", { width: 20, ascii: true }))).toEqual(["- a"]);
  });

  it("short URLs", () => {
    expect(shortUrl("https://github.com/cli/cli/releases/tag/v2.102.0")).toBe("github.com/cli/cli/releases/tag/v2.102.0");
  });
});

describe("the panel (pure layout)", () => {
  const view = { cols: 100, rows: 30, ascii: false, scroll: 0 };

  it("fills the screen, centered, double-line frame, title, hints", () => {
    const { lines } = renderPopup(content(), view);
    expect(lines).toHaveLength(30);
    for (const l of lines) expect(displayWidth(l)).toBeLessThanOrEqual(100);
    const text = plain(lines).join("\n");
    expect(text).toContain("╔");
    expect(text).toContain(" What's new in Codex CLI 0.162.1 ");
    expect(text).toContain("↑/↓ scroll · PgUp/PgDn · o open in browser · q/Esc close");
    expect(text).toContain("╚");
  });

  it("ASCII mode: a +--+ frame and no box-drawing characters", () => {
    const text = plain(renderPopup(content(), { ...view, ascii: true }).lines).join("\n");
    expect(text).toContain("+---");
    expect(text).toContain("Up/Down scroll");
    expect(text).not.toMatch(/[═║╔╗╚╝╟╢─•]/);
  });

  it("scrolls long notes, clamps, and shows the position", () => {
    const notes = Array.from({ length: 60 }, (_, i) => `- line ${i + 1}`).join("\n");
    const first = renderPopup(content({ notes }), view);
    expect(first.maxScroll).toBeGreaterThan(0);
    expect(plain(first.lines).join("\n")).toMatch(new RegExp(`1-${first.bodyHeight} of 60`));
    const end = renderPopup(content({ notes }), { ...view, scroll: 999 });
    expect(plain(end.lines).join("\n")).toContain("60 of 60");
    expect(plain(end.lines).join("\n")).toContain("line 60");
  });

  it("states: loading, error with link, no notes with link, installed + history, demo notice", () => {
    const text = (c: PopupContent) => plain(renderPopup(c, view).lines).join("\n");
    expect(text(content({ state: "loading" }))).toContain("Fetching notes… (q cancels)");
    expect(text(content({ state: "error", error: "HTTP 503" }))).toMatch(/Couldn't load the release notes: HTTP 503[\s\S]*Official notes: https:\/\/github\.com/);
    expect(text(content({ state: "none" }))).toContain("No release notes for 0.162.1.");
    expect(text(content({ installed: "0.161.0", historyLink: "https://github.com/openai/codex/releases" }))).toContain("You're on 0.161.0; earlier changes: github.com/openai/codex/releases");
    expect(text(content({ demo: true }))).toContain("DEMO MODE: sample data only.");
  });
});

describe("fallbacks", () => {
  it("too small for a panel below 60 columns or 15 rows", () => {
    expect(fitsPopup(60, 15)).toBe(true);
    expect(fitsPopup(59, 30)).toBe(false);
    expect(fitsPopup(100, 14)).toBe(false);
  });

  it("not a TTY: the notes inline, plain and sanitized, then the link", async () => {
    let written = "";
    const output = Object.assign(new EventEmitter(), { isTTY: false, columns: 80, rows: 24, write: (s: string) => ((written += s), true) });
    const input = Object.assign(new EventEmitter(), { isTTY: false, resume() {}, pause() {} });
    await showNotes(content({ notes: `- a${ESC}]0;x${BEL}` }), { input, output: output as unknown as NodeJS.WriteStream, ascii: true });
    expect(written).toContain("What's new in Codex CLI 0.162.1");
    expect(written).toContain("- a");
    expect(written).toContain("Official notes: https://github.com/openai/codex/releases/tag/rust-v0.162.1");
    expect(written).not.toContain(ESC);
    expect(inlineNotes(content(), 80)).not.toContain(ESC);
  });
});

class FakeTTYOut extends EventEmitter {
  isTTY = true;
  columns = 100;
  rows = 30;
  raw = "";
  write(s: string) {
    this.raw += s;
    return true;
  }
}
class FakeTTYIn extends EventEmitter {
  isTTY = true;
  isRaw = true;
  paused = true;
  isPaused() {
    return this.paused;
  }
  setRawMode(mode: boolean) {
    this.isRaw = mode;
  }
  resume() {
    this.paused = false;
  }
  pause() {
    this.paused = true;
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("the popup on a terminal", () => {
  it("draws only on the alternate screen and restores the previous screen and stdin on close", async () => {
    const output = new FakeTTYOut();
    const input = new FakeTTYIn();
    const done = showNotes(content(), { input, output: output as unknown as NodeJS.WriteStream, ascii: false, cursorHiddenAfter: true });
    await tick();
    expect(output.raw.startsWith(`${ESC}[?1049h`)).toBe(true); // nothing before switching screens
    input.emit("data", `${ESC}[B`);
    input.emit("data", "q");
    await done;
    expect(output.raw.endsWith(`${ESC}[?1049l${ESC}[?25l`)).toBe(true); // back to the main screen, cursor as the prompt had it
    expect(output.raw.split(`${ESC}[?1049l`)).toHaveLength(2); // nothing written after leaving the alternate screen
    expect(input.isRaw).toBe(true);
    expect(input.paused).toBe(true);
    expect(input.listenerCount("data")).toBe(0);
  });

  it("o opens the official link from the registry, never a link from the notes", async () => {
    const output = new FakeTTYOut();
    const input = new FakeTTYIn();
    const open = vi.fn(() => true);
    const done = showNotes(content({ notes: "[click](https://evil.example/x)" }), { input, output: output as unknown as NodeJS.WriteStream, ascii: false, open });
    await tick();
    input.emit("data", "o");
    input.emit("data", ESC);
    await done;
    expect(open).toHaveBeenCalledWith("https://github.com/openai/codex/releases/tag/rust-v0.162.1");
  });

  it("loading: shows Fetching notes…, then the notes; q cancels while loading", async () => {
    const output = new FakeTTYOut();
    const input = new FakeTTYIn();
    let resolve!: (c: PopupContent) => void;
    const pending = new Promise<PopupContent>((r) => (resolve = r));
    const done = showNotes(pending, { input, output: output as unknown as NodeJS.WriteStream, ascii: false });
    await tick();
    expect(stripVTControlCharacters(output.raw)).toContain("Fetching notes… (q cancels)");
    input.emit("data", "q");
    await done;
    resolve(content());
    await tick();
    expect(stripVTControlCharacters(output.raw)).not.toContain("What's new in Codex CLI"); // never drawn after cancel
  });

  it("re-lays out on resize", async () => {
    const output = new FakeTTYOut();
    const input = new FakeTTYIn();
    const done = showNotes(content(), { input, output: output as unknown as NodeJS.WriteStream, ascii: true });
    await tick();
    output.columns = 70;
    output.emit("resize");
    const last = stripVTControlCharacters(output.raw.slice(output.raw.lastIndexOf(`${ESC}[H`)));
    for (const l of last.split("\r\n")) expect(displayWidth(l)).toBeLessThanOrEqual(70);
    input.emit("data", "q");
    await done;
  });
});