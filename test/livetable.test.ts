import { EventEmitter } from "node:events";
import { stripVTControlCharacters } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveTable, liveTableAllowed, RESIZE_SETTLE_MS, renderFrame, screenRows } from "../src/ui/livetable";
import { renderTable } from "../src/ui/table";
import type { ToolScan } from "../src/types";
import { icons } from "../src/ui/symbols";

const ESC = String.fromCharCode(27);

function scan(id: string, overrides: Partial<ToolScan> = {}): ToolScan {
  return {
    id, name: id.toUpperCase(), shortName: id, group: "agents", docsUrl: "", installed: true, installMethod: "npm",
    binaryPath: `/bin/${id}`, installedVersion: "1.0.0", latestVersion: "1.1.0", latestStaleCachedAt: null,
    state: "outdated", updateAvailable: true, needsAdmin: false, plan: null, shadowed: [], deprecation: null,
    notes: [], projectPin: null, compatibility: null, waitingFor: null, broken: null, ...overrides,
  };
}
const pendingOf = (r: ToolScan): ToolScan => ({ ...r, latestVersion: null, state: "unknown", updateAvailable: false });

/** A tiny terminal: text, \n, \r, cursor up (ESC[nA), erase to end (ESC[J); other sequences ignored. */
class Screen {
  lines: string[] = [""];
  row = 0;
  write(data: string): void {
    const re = new RegExp(`${ESC}\\[(\\??)(\\d*)([A-Za-z])|\\n|\\r|[^${ESC}\\n\\r]+`, "g");
    for (const m of data.matchAll(re)) {
      const t = m[0];
      if (t === "\n") {
        this.row++;
        if (this.row >= this.lines.length) this.lines.push("");
      } else if (t === "\r") {
        /* column 0: writes below always start a fresh line here */
      } else if (m[3] === "A") this.row = Math.max(0, this.row - Number(m[2] || 1));
      else if (m[3] === "J" && !m[1]) this.lines = [...this.lines.slice(0, this.row), ""];
      else if (!m[3]) this.lines[this.row] = (this.lines[this.row] ?? "") + stripVTControlCharacters(t);
    }
  }
  text(): string {
    return this.lines.join("\n");
  }
}

class FakeOut extends EventEmitter {
  columns = 100;
  rows = 40;
  screen = new Screen();
  raw = "";
  write(data: string): boolean {
    this.raw += data;
    this.screen.write(data);
    return true;
  }
}

class FakeIn extends EventEmitter {
  isTTY = true;
  raw = false;
  get isRaw() {
    return this.raw;
  }
  isPaused() {
    return true;
  }
  setRawMode(mode: boolean) {
    this.raw = mode;
  }
  resume() {}
  pause() {}
}

const timers: LiveTable[] = [];
afterEach(() => {
  for (const t of timers.splice(0)) t.finish();
  vi.useRealTimers();
});

function live(placeholders: ToolScan[], out: FakeOut, input: FakeIn | null = null, keys = { quit: vi.fn(), cancel: vi.fn() }, onAbandon = vi.fn()) {
  const table = new LiveTable(placeholders, "Checking latest versions...", out as unknown as NodeJS.WriteStream, input, keys, onAbandon);
  timers.push(table);
  return { table, keys, onAbandon };
}

describe("when the live table is used", () => {
  it("only in an interactive terminal that can redraw, unless switched off", () => {
    expect(liveTableAllowed(true, {})).toBe(true);
    expect(liveTableAllowed(false, {})).toBe(false);
    expect(liveTableAllowed(true, { CI: "true" })).toBe(false);
    expect(liveTableAllowed(true, { TERM: "dumb" })).toBe(false);
    expect(liveTableAllowed(true, { CCL_CAUT_NO_LIVE: "1" })).toBe(false);
    expect(liveTableAllowed(true, { CCL_CAUT_NO_LIVE: "0" })).toBe(true);
    expect(liveTableAllowed(true, { NO_COLOR: "1" })).toBe(true); // colors are a separate concern
  });
});

describe("renderFrame (row states -> lines)", () => {
  const rows = [scan("claude", { state: "up-to-date", latestVersion: "1.0.0", updateAvailable: false }), pendingOf(scan("codex")), scan("kimi", { group: "dev" })];
  const lines = renderFrame({ rows, pending: new Set(["codex"]), tick: 0, message: "Checking latest versions...", columns: 100 }).map((l) => stripVTControlCharacters(l));

  it("starts like clack's spinner, then the table in registry/group order", () => {
    expect(lines[1]).toMatch(/^\S  Checking latest versions\.\.\.$/);
    const names = lines.filter((l) => /CLAUDE|CODEX|KIMI/.test(l)).map((l) => /(CLAUDE|CODEX|KIMI)/.exec(l)![1]);
    expect(names).toEqual(["CLAUDE", "CODEX", "KIMI"]);
  });

  it("shows checking… for pending rows and the result for finished ones", () => {
    const codex = lines.find((l) => l.includes("CODEX"))!.split(/\s{2,}/);
    expect(codex.slice(-4)).toEqual(["1.0.0", icons.ellipsis, `checking${icons.ellipsis}`, "npm"]);
    expect(lines.find((l) => l.includes("CLAUDE"))).toMatch(/up-to-date/);
  });

  it("never draws a line as wide as the terminal (no wrapping)", () => {
    const narrow = renderFrame({ rows, pending: new Set(["codex"]), tick: 3, message: "Checking latest versions...", columns: 30 });
    for (const l of narrow) expect(stripVTControlCharacters(l).length).toBeLessThanOrEqual(29);
  });

  it("leaves the static table unchanged (same output as 1.1 for the same data)", () => {
    const done = [scan("claude"), scan("codex", { latestStaleCachedAt: new Date(Date.now() - 3_600_000).toISOString() })];
    expect(renderTable(done, 80, { ids: new Set(), icon: "x" })).toBe(renderTable(done, 80));
  });

  it("counts rewrapped rows after a resize", () => {
    expect(screenRows(["a".repeat(90), "b"], 70)).toBe(3);
  });
});

describe("LiveTable", () => {
  it("draws in place, fills rows in, and erases itself completely on finish", () => {
    vi.useFakeTimers();
    const out = new FakeOut();
    out.write("◇  Found 2 of 23 supported CLIs\n");
    const before = out.screen.text();
    const { table } = live([pendingOf(scan("claude")), pendingOf(scan("codex"))], out);
    expect(table.start()).toBe(true);
    expect(out.screen.text()).toContain(`checking${icons.ellipsis}`);
    table.update(scan("claude"));
    vi.advanceTimersByTime(100);
    expect(out.screen.text()).toMatch(/CLAUDE.*update available/);
    expect(out.screen.text().match(/CLAUDE/g)).toHaveLength(1); // redrawn in place, not appended
    table.finish();
    expect(out.screen.text()).toBe(before);
    expect(out.raw.endsWith(`${ESC}[?25h`)).toBe(true); // cursor shown again
  });

  it("redraws at most 10 times a second", () => {
    vi.useFakeTimers();
    const out = new FakeOut();
    const { table } = live([pendingOf(scan("claude"))], out);
    table.start();
    const frames = () => out.raw.split(`${ESC}[?2026h`).length - 1;
    const first = frames();
    vi.advanceTimersByTime(1_000);
    expect(frames() - first).toBeLessThanOrEqual(10);
  });

  it("doesn't start when the table is taller than the terminal (spinner instead)", () => {
    const out = new FakeOut();
    out.rows = 6;
    const { table } = live([pendingOf(scan("claude")), pendingOf(scan("codex")), pendingOf(scan("kimi"))], out);
    expect(table.start()).toBe(false);
    expect(out.raw).toBe("");
  });

  it("gives up on a resize: erases what it drew and hands over to the spinner", () => {
    vi.useFakeTimers();
    const out = new FakeOut();
    out.write("◇  Found 1 of 23 supported CLIs\n");
    const before = out.screen.text();
    const { table, onAbandon } = live([pendingOf(scan("claude"))], out);
    table.start();
    out.emit("resize");
    expect(onAbandon).not.toHaveBeenCalled(); // waits for the size to settle
    const drawnBefore = out.raw.length;
    vi.advanceTimersByTime(RESIZE_SETTLE_MS - 1);
    expect(out.raw.length).toBe(drawnBefore); // no more frames once resizing
    vi.advanceTimersByTime(1);
    expect(onAbandon).toHaveBeenCalledOnce();
    expect(table.isActive).toBe(false);
    expect(out.screen.text()).toBe(before);
    expect(out.raw.endsWith(`${ESC}[?25h`)).toBe(true);
  });

  it("finishing while a resize settles erases for the new width, without the spinner", () => {
    vi.useFakeTimers();
    const out = new FakeOut();
    const before = out.screen.text();
    const { table, onAbandon } = live([pendingOf(scan("claude"))], out);
    table.start();
    out.emit("resize");
    expect(table.isActive).toBe(true);
    table.finish();
    expect(out.screen.text()).toBe(before);
    vi.advanceTimersByTime(RESIZE_SETTLE_MS * 2);
    expect(onAbandon).not.toHaveBeenCalled();
  });

  it.each([
    ["q", "quit"],
    ["\u0003", "cancel"],
    [ESC, "cancel"],
  ] as const)("key %j mid-check: erases the frame, restores the terminal, then %s", (key, action) => {
    vi.useFakeTimers();
    const out = new FakeOut();
    const before = out.screen.text();
    const input = new FakeIn();
    const { table, keys } = live([pendingOf(scan("claude"))], out, input);
    table.start();
    expect(input.raw).toBe(true);
    input.emit("data", Buffer.from(key));
    expect(keys[action]).toHaveBeenCalledOnce();
    expect(out.screen.text()).toBe(before);
    expect(input.raw).toBe(false);
    expect(out.raw.endsWith(`${ESC}[?25h`)).toBe(true);
  });

  it("regression (the doubled 'Ready to update?'): stdin is left as it was found, not forced out of raw mode", () => {
    vi.useFakeTimers();
    const out = new FakeOut();
    const input = new FakeIn();
    input.raw = true; // clack leaves stdin raw on Windows
    const calls: boolean[] = [];
    const setRawMode = input.setRawMode.bind(input);
    input.setRawMode = (mode: boolean) => {
      calls.push(mode);
      setRawMode(mode);
    };
    const { table } = live([pendingOf(scan("claude"))], out, input);
    table.start();
    table.finish();
    expect(calls).toEqual([]); // never switched off (that made the next prompt lose its first keys)
    expect(input.raw).toBe(true);
    expect(input.listenerCount("data")).toBe(0);
  });

  it("ignores other keys (arrows, letters)", () => {
    const out = new FakeOut();
    const input = new FakeIn();
    const { table, keys } = live([pendingOf(scan("claude"))], out, input);
    table.start();
    input.emit("data", Buffer.from(`${ESC}[A`));
    input.emit("data", Buffer.from("x"));
    expect(keys.quit).not.toHaveBeenCalled();
    expect(keys.cancel).not.toHaveBeenCalled();
    expect(table.isActive).toBe(true);
  });
});