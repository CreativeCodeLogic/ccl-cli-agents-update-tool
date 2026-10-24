import { PassThrough, Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { cellSlice, layBackdrop, ScreenRecord, type ScreenSnapshot } from "../src/ui/backdrop";
import { checklist } from "../src/ui/prompts";
import { renderPopup, showNotes, type PopupContent } from "../src/whatsnew/popup";

const ESC = "\u001b";

function record(cols: number, rows: number, ...chunks: string[]) {
  const r = new ScreenRecord();
  r.reset(cols, rows);
  for (const c of chunks) r.write(c);
  return r;
}
const text = (s: ScreenSnapshot | null) => s?.lines.map((l) => l.join("").trimEnd()) ?? null;

describe("ScreenRecord: CCL CAUT's own output as a plain-text screen", () => {
  it("text, CR/LF and colors: positions kept, styles dropped, hyperlinks show their text only", () => {
    const r = record(20, 4, `${ESC}[1mCCL CAUT${ESC}[22m\n`, `${ESC}]8;;https://x.test${ESC}\\docs${ESC}]8;;${ESC}\\ here\r\nab\rX`);
    expect(text(r.snapshot())).toEqual(["CCL CAUT", "docs here", "Xb", ""]);
  });

  it("a prompt redraw (cursor up, erase down, new frame) leaves only the last frame", () => {
    const frame = (focus: number) => ["◆  Select", ...["codex", "gh"].map((t, i) => `│  ${i === focus ? ">" : " "} ${t}`), "└"].join("\n");
    const r = record(30, 8, "table row\n", frame(0), `${ESC}[3A\r${ESC}[J`, frame(1));
    expect(text(r.snapshot())).toEqual(["table row", "◆  Select", "│    codex", "│  > gh", "└", "", "", ""]);
  });

  it("the two-line status erases itself (cursor up, CR, erase down)", () => {
    const r = record(30, 5, "done\n", "│\n◐  Updating gh\n", `${ESC}[2A\r${ESC}[J`, "✔ gh updated\n");
    expect(text(r.snapshot())).toEqual(["done", "✔ gh updated", "", "", ""]);
  });

  it("past the bottom the screen scrolls: the last rows stay, marked as scrolled", () => {
    const r = record(10, 3, "1\n2\n3\n4\n5");
    expect(r.snapshot()).toMatchObject({ scrolled: true });
    expect(text(r.snapshot())).toEqual(["3", "4", "5"]);
  });

  it("a long line wraps at the width; wide characters take two columns", () => {
    const r = record(4, 3, "abcdef\n界x");
    const snap = r.snapshot()!;
    expect(text(snap)).toEqual(["abcd", "ef", "界x"]);
    expect(snap.lines[2]).toEqual(["界", "", "x"]);
  });

  it("an escape sequence split across two writes is joined", () => {
    const r = record(10, 3, "abc", `${ESC}[`, "1Dz");
    expect(text(r.snapshot())).toEqual(["abz", "", ""]);
  });

  it("the alternate screen (a popup) is not recorded", () => {
    const r = record(10, 3, "base", `${ESC}[?1049h${ESC}[2Jpopup text\n\n\n${ESC}[?1049l`, "!");
    expect(text(r.snapshot())).toEqual(["base!", "", ""]);
  });

  it("unreliable until the next clean screen: a redraw above the top (taller than the window), a resize, an unknown sequence", () => {
    expect(record(10, 3, "1\n2\n3\n4", `${ESC}[3A`).snapshot()).toBeNull();
    const resized = record(10, 3, "x");
    resized.resized();
    expect(resized.snapshot()).toBeNull();
    for (const seq of [`${ESC}[2S`, `${ESC}[1;2r`, `${ESC}c`, `${ESC}[?7l`]) expect(record(10, 3, "x", seq).snapshot()).toBeNull();
    resized.reset(10, 3);
    resized.write("again");
    expect(text(resized.snapshot())).toEqual(["again", "", ""]);
  });

  it("a real checklist session (move, select, redraw) leaves exactly its last frame", async () => {
    const input = new PassThrough();
    let drawn = "";
    const output = Object.assign(
      new Writable({
        write: (chunk, _e, cb) => {
          drawn += String(chunk);
          cb();
        },
      }),
      { columns: 70, rows: 20, isTTY: true },
    );
    setTimeout(async () => {
      for (const k of ["\x1b[B", " ", "\x1b[B", "\x1b[A", "q"]) {
        input.write(k);
        await new Promise((r) => setTimeout(r, 15));
      }
    }, 20);
    const options = ["codex", "gh", "wrangler"].map((value) => ({ value, label: `${value}  1.0 -> 1.1` }));
    await checklist({ message: "Select", options, initialValues: [], input, output } as never);
    const r = record(70, 20, "Scan table\n\n", drawn);
    const lines = text(r.snapshot())!;
    expect(lines[0]).toBe("Scan table");
    // The closed prompt: one frame, no leftovers of the earlier redraws.
    expect(lines.filter((l) => l.includes("Select"))).toHaveLength(1);
    expect(stripVTControlCharacters(drawn)).toContain("wrangler");
  });
});

describe("layBackdrop: the snapshot for the current window size", () => {
  const snap = (lines: string[], scrolled = false, cols = 20): ScreenSnapshot => ({ cols, rows: lines.length, scrolled, lines: lines.map((l) => [...l]) });

  it("same size: same rows", () => {
    expect(layBackdrop(snap(["a", "b", "c"]), 20, 3)?.map((l) => l.join(""))).toEqual(["a", "b", "c"]);
  });

  it("taller window: a scrolled screen stays at the bottom, an unscrolled one at the top", () => {
    expect(layBackdrop(snap(["a", "b"], true), 20, 4)?.map((l) => l.join(""))).toEqual(["", "", "a", "b"]);
    expect(layBackdrop(snap(["a", "b"]), 20, 4)?.map((l) => l.join(""))).toEqual(["a", "b", "", ""]);
  });

  it("shorter window: the bottom of the output stays in view", () => {
    expect(layBackdrop(snap(["a", "b", "c", "d"], true), 20, 2)?.map((l) => l.join(""))).toEqual(["c", "d"]);
    expect(layBackdrop(snap(["a", "b", "c", ""]), 20, 2)?.map((l) => l.join(""))).toEqual(["b", "c"]);
  });

  it("narrower than a drawn line: no backdrop (it would wrap somewhere else)", () => {
    expect(layBackdrop(snap(["a long line here"]), 10, 1)).toBeNull();
    expect(layBackdrop(snap(["short     "]), 6, 1)).not.toBeNull();
  });

  it("cellSlice: a wide character cut at an edge becomes a space", () => {
    const line = ["a", "界", "", "b"];
    expect(cellSlice(line, 0, 2)).toBe("a ");
    expect(cellSlice(line, 2, 4)).toBe(" b");
    expect(cellSlice(line, 0, 6)).toBe("a界b  ");
  });
});

describe("the overlay: the panel on top of the dimmed backdrop", () => {
  const content: PopupContent = { tool: "Codex CLI", version: "0.164.0", state: "ready", notes: "- one change", link: "https://x.test/notes" };
  const cols = 110;
  const rows = 20;
  const under = Array.from({ length: rows }, (_, r) => [...`row ${String(r).padStart(2, "0")} ${"x".repeat(cols - 7)}`]);

  it("the backdrop shows outside the panel at the same positions; the panel is unchanged", () => {
    const plain = renderPopup(content, { cols, rows, ascii: false, scroll: 0 }).lines.map((l) => stripVTControlCharacters(l));
    const over = renderPopup(content, { cols, rows, ascii: false, scroll: 0, backdrop: under }).lines.map((l) => stripVTControlCharacters(l));
    expect(over).toHaveLength(rows);
    // Row 0 is above the panel: the backdrop row as it was.
    expect(over[0]).toBe(under[0]!.join(""));
    for (let r = 1; r < rows - 1; r++) {
      const left = plain[r]!.length - plain[r]!.trimStart().length;
      // Left of the panel: the backdrop's own columns; the panel itself: identical to the blank version.
      expect(over[r]!.slice(0, left)).toBe(under[r]!.slice(0, left).join(""));
      expect(over[r]!.slice(left, left + 100)).toBe(plain[r]!.slice(left, left + 100));
      expect(over[r]!.slice(left + 100)).toBe(under[r]!.slice(left + 100).join(""));
    }
  });

  it("no backdrop: the blank background, as before", () => {
    const plain = renderPopup(content, { cols, rows, ascii: false, scroll: 0 }).lines;
    expect(renderPopup(content, { cols, rows, ascii: false, scroll: 0, backdrop: null }).lines).toEqual(plain);
  });

  it("the ASCII console and colors off never ask for the backdrop", async () => {
    for (const ascii of [true, false]) {
      // The test runner's output is not a terminal: colors are off here.
      const backdrop = vi.fn(() => null);
      const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: () => undefined });
      const output = Object.assign(new PassThrough(), { isTTY: true, columns: 100, rows: 30 }) as unknown as NodeJS.WriteStream;
      const done = showNotes(content, { input, output, ascii, backdrop });
      input.write("q");
      await done;
      expect(backdrop).not.toHaveBeenCalled();
    }
  });
});
