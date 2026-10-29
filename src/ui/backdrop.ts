import { graphemes, graphemeWidth } from "../whatsnew/width";

/**
 * What CCL CAUT itself drew on the screen, as plain text, so a popup can show it
 * dimmed behind its panel (the "What's new" overlay). Recording starts on the
 * clean screen of an interactive run (clearScreenKeepScrollback: cursor at the
 * top-left), so positions are known without asking the terminal anything.
 *
 * Only CCL CAUT's own writes are replayed into a small screen model: text,
 * CR/LF, cursor moves and erases (what clack, the live table and the status
 * lines use). Anything else (an escape sequence it doesn't model, a resize, a
 * redraw that reaches above the top of the window, e.g. a checklist taller than
 * the window) makes the record unreliable until the next clean screen: the
 * popup then keeps a blank background. A wrong backdrop is worse than none.
 */

/** One screen row: one entry per column; "" fills the second column of a wide character. */
export type Cells = string[];

export interface ScreenSnapshot {
  cols: number;
  rows: number;
  lines: Cells[];
  /** The output reached the bottom row (the screen scrolled): a resize keeps it bottom-anchored. */
  scrolled: boolean;
}

const ESC = "\u001b";

export class ScreenRecord {
  private screen: Cells[] = [];
  private row = 0;
  private col = 0;
  private saved = { row: 0, col: 0 };
  private cols = 0;
  private rows = 0;
  private reliable = false;
  private scrolled = false;
  /** Between ESC[?1049h and ESC[?1049l: the alternate screen (a popup), not recorded. */
  private alternate = false;
  /** An escape sequence cut between two writes. */
  private pending = "";

  /** A clean screen of this size, cursor top-left (call right after clearing it). */
  reset(cols: number, rows: number): void {
    this.cols = Math.max(1, cols);
    this.rows = Math.max(1, rows);
    this.screen = Array.from({ length: this.rows }, () => []);
    this.row = 0;
    this.col = 0;
    this.saved = { row: 0, col: 0 };
    this.reliable = true;
    this.scrolled = false;
    this.alternate = false;
    this.pending = "";
  }

  /** The window was resized: terminals reflow differently, so stop trusting the record. */
  resized(): void {
    this.reliable = false;
  }

  /** The screen as CCL CAUT left it, or null when it can't be lined up reliably. */
  snapshot(): ScreenSnapshot | null {
    if (!this.reliable || this.alternate || this.pending) return null;
    return { cols: this.cols, rows: this.rows, lines: this.screen.map((l) => [...l]), scrolled: this.scrolled };
  }

  write(chunk: string): void {
    if (!this.reliable) return;
    const text = this.pending + chunk;
    this.pending = "";
    let i = 0;
    let plain = "";
    const flush = () => {
      if (plain && !this.alternate) this.print(plain);
      plain = "";
    };
    while (i < text.length && this.reliable) {
      const ch = text[i]!;
      if (ch !== ESC && ch !== "\n" && ch !== "\r" && ch !== "\b" && ch !== "\t" && ch !== "\u0007") {
        plain += ch;
        i++;
        continue;
      }
      flush();
      if (ch !== ESC) {
        if (!this.alternate) this.control(ch);
        i++;
        continue;
      }
      const used = this.escape(text, i);
      if (used === 0) {
        this.pending = text.slice(i);
        return;
      }
      i += used;
    }
    flush();
  }

  private control(ch: string): void {
    if (ch === "\n") {
      this.col = 0;
      this.lineFeed();
    } else if (ch === "\r") this.col = 0;
    else if (ch === "\b") this.col = Math.max(0, Math.min(this.col, this.cols - 1) - 1);
    else if (ch === "\t") this.col = Math.min(this.cols - 1, (Math.floor(this.col / 8) + 1) * 8);
  }

  private lineFeed(): void {
    if (this.row < this.rows - 1) {
      this.row++;
      return;
    }
    this.screen.shift();
    this.screen.push([]);
    this.scrolled = true;
  }

  private print(text: string): void {
    for (const g of graphemes(text)) {
      const width = graphemeWidth(g);
      if (width === 0) {
        // A combining mark or variation selector: part of the character before it.
        const line = this.screen[this.row]!;
        const at = Math.max(0, this.col - 1);
        if (line[at]) line[at] += g;
        continue;
      }
      if (this.col + width > this.cols) {
        // Past the right edge: the terminal wraps to the next row.
        this.col = 0;
        this.lineFeed();
      }
      const line = this.screen[this.row]!;
      while (line.length < this.col) line.push(" ");
      line[this.col] = g;
      if (width === 2) line[this.col + 1] = "";
      this.col += width;
    }
  }

  /** Characters used by the escape sequence at `i` (0: incomplete, wait for more). */
  private escape(text: string, i: number): number {
    const next = text[i + 1];
    if (next === undefined) return 0;
    if (next === "[") {
      const match = /^\u001b\[([?>=]?)([\d;]*)([ -/]*)([@-~])/.exec(text.slice(i));
      if (!match) {
        // Incomplete (wait) or malformed (stop trusting the record).
        if (/^\u001b\[[?>=]?[\d;]*[ -/]*$/.test(text.slice(i))) return 0;
        this.reliable = false;
        return text.length - i;
      }
      this.csi(match[1]!, match[2]!, match[3]!, match[4]!);
      return match[0].length;
    }
    if (next === "]") {
      // OSC (hyperlinks, titles): no visible text. Ends at BEL or ESC \.
      const rest = text.slice(i + 2);
      const bel = rest.indexOf("\u0007");
      const st = rest.indexOf(`${ESC}\\`);
      const end = bel >= 0 && (st < 0 || bel < st) ? bel + 1 : st >= 0 ? st + 2 : -1;
      return end < 0 ? 0 : 2 + end;
    }
    if (next === "7" || next === "8") {
      if (!this.alternate) {
        if (next === "7") this.saved = { row: this.row, col: this.col };
        else ({ row: this.row, col: this.col } = this.saved);
      }
      return 2;
    }
    this.reliable = false;
    return text.length - i;
  }

  private csi(prefix: string, params: string, intermediate: string, final: string): void {
    const n = (index = 0, fallback = 1) => {
      const value = Number(params.split(";")[index] || NaN);
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    if (prefix === "?") {
      if (final === "h" || final === "l") {
        for (const mode of params.split(";")) {
          if (mode === "1049" || mode === "47" || mode === "1047") this.alternate = final === "h";
          // Column mode, origin mode, autowrap: they move text; other modes (cursor, paste) don't.
          else if (mode === "3" || mode === "6" || mode === "7") this.reliable = false;
        }
        return;
      }
      this.reliable = false;
      return;
    }
    if (this.alternate) return;
    if (prefix || intermediate) {
      this.reliable = false;
      return;
    }
    const line = () => this.screen[this.row]!;
    switch (final) {
      case "m":
        return; // colors and styles: the backdrop is drawn dimmed anyway
      case "A": {
        const up = n();
        // A redraw reaching above the window (a frame taller than the window): positions are lost.
        if (up > this.row) this.reliable = false;
        this.row = Math.max(0, this.row - up);
        this.col = Math.min(this.col, this.cols - 1);
        return;
      }
      case "B":
        this.row = Math.min(this.rows - 1, this.row + n());
        return;
      case "C":
        this.col = Math.min(this.cols - 1, this.col + n());
        return;
      case "D":
        this.col = Math.max(0, Math.min(this.col, this.cols - 1) - n());
        return;
      case "G":
        this.col = Math.min(this.cols - 1, n() - 1);
        return;
      case "H":
      case "f":
        this.row = Math.min(this.rows - 1, n(0) - 1);
        this.col = Math.min(this.cols - 1, n(1) - 1);
        return;
      case "J": {
        const mode = n(0, 0);
        if (mode === 0) {
          this.screen[this.row] = line().slice(0, this.col);
          for (let r = this.row + 1; r < this.rows; r++) this.screen[r] = [];
        } else if (mode === 2) this.screen = Array.from({ length: this.rows }, () => []);
        else if (mode !== 3) this.reliable = false;
        return;
      }
      case "K": {
        const mode = n(0, 0);
        if (mode === 0) this.screen[this.row] = line().slice(0, this.col);
        else if (mode === 1) this.screen[this.row] = [...Array.from({ length: Math.min(this.col + 1, this.cols) }, () => " "), ...line().slice(this.col + 1)];
        else if (mode === 2) this.screen[this.row] = [];
        return;
      }
      default:
        this.reliable = false;
    }
  }
}

/**
 * The snapshot laid out for a window of this size: same positions when the size
 * is unchanged; after a resize, bottom-anchored if the output had scrolled (top
 * otherwise). null when a drawn line no longer fits the width (it would wrap).
 */
export function layBackdrop(snapshot: ScreenSnapshot, cols: number, rows: number): Cells[] | null {
  const trimmed = snapshot.lines.map((l) => {
    const copy = [...l];
    while (copy.length > 0 && (copy[copy.length - 1] === " " || copy[copy.length - 1] === undefined)) copy.pop();
    return copy;
  });
  if (trimmed.some((l) => l.length > cols)) return null;
  let lines = trimmed;
  if (rows < lines.length) {
    // Shrunk: terminals keep the cursor (the bottom of the output) in view.
    const used = snapshot.scrolled ? lines.length : lastUsed(lines) + 1;
    const start = Math.max(0, used - rows);
    lines = lines.slice(start, start + rows);
  } else if (rows > lines.length) {
    const extra = Array.from({ length: rows - lines.length }, (): Cells => []);
    lines = snapshot.scrolled ? [...extra, ...lines] : [...lines, ...extra];
  }
  return lines;
}

function lastUsed(lines: Cells[]): number {
  for (let r = lines.length - 1; r >= 0; r--) if (lines[r]!.some((c) => c && c !== " ")) return r;
  return 0;
}

/** Columns [from, to) of a backdrop row as text; a wide character cut at either edge becomes a space. */
export function cellSlice(line: Cells, from: number, to: number): string {
  let out = "";
  for (let c = from; c < to; c++) {
    const cell = line[c];
    if (cell === undefined) out += " ";
    else if (cell === "") out += c === from ? " " : "";
    else if (line[c + 1] === "" && c + 1 >= to) out += " ";
    else out += cell;
  }
  return out;
}

/** The record of this run's screen (interactive runs only; see clearScreenKeepScrollback). */
export const screenRecord = new ScreenRecord();

const wrapped = new WeakSet<NodeJS.WriteStream>();

/**
 * Start (or restart) recording what CCL CAUT writes to the terminal, on a screen
 * that was just cleared: stdout, and stderr when it is the same terminal. Each
 * stream's write is wrapped once; the output itself is unchanged.
 */
export function recordScreen(out: NodeJS.WriteStream = process.stdout, err: NodeJS.WriteStream | null = process.stderr.isTTY ? process.stderr : null): void {
  screenRecord.reset(out.columns ?? 80, out.rows ?? 24);
  for (const stream of err ? [out, err] : [out]) {
    if (wrapped.has(stream)) continue;
    wrapped.add(stream);
    const original = stream.write.bind(stream) as (...args: unknown[]) => boolean;
    stream.write = ((chunk: unknown, ...rest: unknown[]) => {
      try {
        screenRecord.write(typeof chunk === "string" ? chunk : chunk instanceof Uint8Array ? Buffer.from(chunk).toString("utf8") : "");
      } catch {
        screenRecord.resized();
      }
      return original(chunk, ...rest);
    }) as typeof stream.write;
  }
  if (!resizeWatched.has(out)) {
    resizeWatched.add(out);
    out.on("resize", () => screenRecord.resized());
  }
}

const resizeWatched = new WeakSet<NodeJS.WriteStream>();
