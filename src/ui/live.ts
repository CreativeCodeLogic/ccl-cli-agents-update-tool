import { S_BAR, unicodeOr } from "@clack/prompts";
import { stripVTControlCharacters } from "node:util";
import pc from "./colors";
import { icons } from "./symbols";
import { tone } from "./theme";
import { displayWidth, fitWidth } from "./width";

const FRAMES = unicode() ? ["◒", "◐", "◓", "◑"] : ["-", "\\", "|", "/"];
const TICK_MS = 100;

function unicode(): boolean {
  return unicodeOr("x", "") === "x";
}

/** m:ss, e.g. 0:07 or 1:23. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Cut a line to `width` columns (display width; escape codes, tabs and trailing spaces removed). */
export function fitToWidth(text: string, width: number): string {
  const clean = stripVTControlCharacters(text).replace(/\t/g, "  ").replace(/\s+$/, "");
  return fitWidth(clean, width, icons.ellipsis);
}

/**
 * The status line: spinner, title, then the elapsed time and counter. When it
 * doesn't fit, the title gives way (the time and counter stay readable).
 */
export function statusLine(spinner: string, title: string, status: string, width: number): string {
  const tail = status ? `  ${tone.muted(status)}` : "";
  const full = `${spinner}  ${title}${tail}`;
  if (displayWidth(full) <= width) return full;
  const room = width - displayWidth(`${spinner}  `) - displayWidth(tail);
  if (room < 8) return `${spinner}  ${fitToWidth(`${stripVTControlCharacters(title)}${tail ? `  ${status}` : ""}`, Math.max(1, width - displayWidth(`${spinner}  `)))}`;
  return `${spinner}  ${fitToWidth(title, room)}${tail}`;
}

/**
 * A three-line live status for one running update, redrawn every 100ms:
 *   │
 *   ◐  Updating Codex CLI  $ npm install -g @openai/codex@latest  0:07 · fetched 23 files
 *   │  <latest line of the updater's output, dimmed>
 * Always three rows: every line is cut to the window, and a redraw erases the
 * rows the last frame took (measured at the current width, in case the window
 * was resized and the terminal reflowed them). A line the terminal wraps would
 * otherwise leave a row behind on every redraw: a screen of empty "│" lines.
 * Not a TTY: one static line, no animation. stop() erases it.
 */
export class LiveStatus {
  private frame = 0;
  private timer: NodeJS.Timeout | undefined;
  /** Display widths of the lines on screen (empty: nothing drawn). */
  private drawn: number[] = [];
  private latest = "";
  private counter = "";
  private readonly startedAt = Date.now();
  private readonly tty: boolean;

  constructor(
    private readonly title: string,
    private readonly out: NodeJS.WriteStream = process.stdout,
  ) {
    this.tty = Boolean(out.isTTY);
  }

  start(): void {
    if (!this.tty) {
      this.out.write(`${pc.gray(S_BAR)}\n${tone.action("●")}  ${this.title}\n`);
      return;
    }
    this.out.write("\x1b[?25l"); // hide cursor
    this.draw();
    this.timer = setInterval(() => this.draw(), TICK_MS);
  }

  /** Latest output line and/or a counter such as "fetched 23 files". */
  update(latest?: string, counter?: string): void {
    if (latest !== undefined) this.latest = latest;
    if (counter !== undefined) this.counter = counter;
  }

  elapsed(): string {
    return formatElapsed(Date.now() - this.startedAt);
  }

  stop(): void {
    if (!this.tty) return;
    clearInterval(this.timer);
    this.erase();
    this.out.write("\x1b[?25h"); // show cursor
  }

  private columns(): number {
    return this.out.columns && this.out.columns > 0 ? this.out.columns : 80;
  }

  private erase(): void {
    if (this.drawn.length === 0) return;
    const cols = this.columns();
    // Rows the last frame takes now (a narrower window may have reflowed a line into two).
    const rows = this.drawn.reduce((sum, w) => sum + Math.max(1, Math.ceil(w / cols)), 0);
    this.out.write(`\x1b[${rows}A\r\x1b[J`);
    this.drawn = [];
  }

  /** The frame's lines for a window this wide (each one row, the last column left free). */
  lines(width = this.columns()): string[] {
    const room = Math.max(10, width - 1);
    const spinner = tone.action(FRAMES[this.frame % FRAMES.length] ?? "-");
    const status = [this.elapsed(), this.counter].filter(Boolean).join(" · ");
    const latest = this.latest ? tone.muted(fitToWidth(this.latest, room - 3)) : tone.muted(icons.ellipsis);
    return [pc.gray(S_BAR), statusLine(spinner, this.title, status, room), `${pc.gray(S_BAR)}  ${latest}`];
  }

  private draw(): void {
    const lines = this.lines();
    this.frame++;
    this.erase();
    this.out.write(`${lines.join("\n")}\n`);
    this.drawn = lines.map((l) => displayWidth(l));
  }
}

