import { S_BAR, unicodeOr } from "@clack/prompts";
import { stripVTControlCharacters } from "node:util";
import type { ToolScan } from "../types";
import pc from "./colors";
import { createProgress, type Progress } from "./progress";
import { icons } from "./symbols";
import { renderTable, type PendingRows } from "./table";
import { tone } from "./theme";

/*
 * The live table: while latest versions are looked up, the table of installed
 * tools is drawn right away and each row fills in as its lookup finishes.
 * It is redrawn in place (cursor up + clear to end of screen, one write per
 * frame, at most 10 per second) in the normal scrolling terminal, never the
 * alternate screen. When the check is done the frame is erased and the usual
 * static output is printed, so the scrollback is the same as without it.
 */

const FRAMES = unicodeOr("x", "") === "x" ? ["◒", "◐", "◓", "◑"] : ["-", "\\", "|", "/"];
const TICK_MS = 100;
/** After a resize, wait for the terminal to finish rewrapping before counting rows to erase. */
export const RESIZE_SETTLE_MS = 150;
const ESC = "\x1b";
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
// Synchronized output: terminals that support it paint a frame at once (others ignore it).
const SYNC_START = `${ESC}[?2026h`;
const SYNC_END = `${ESC}[?2026l`;

/** Whether the live table may be used: an interactive terminal that can redraw, and not switched off. */
export function liveTableAllowed(stdoutIsTTY: boolean, env: Readonly<Record<string, string | undefined>>): boolean {
  if (!stdoutIsTTY || env.CI || env.TERM === "dumb") return false;
  return !env.CCL_CAUT_NO_LIVE || env.CCL_CAUT_NO_LIVE === "0";
}

export interface FrameInput {
  /** Every installed tool, in table order: finished rows and placeholders. */
  rows: readonly ToolScan[];
  /** Ids still being checked. */
  pending: ReadonlySet<string>;
  /** Spinner frame index. */
  tick: number;
  message: string;
  columns: number;
}

/** One frame (pure): the spinner line like clack's, then the table with "checking…" rows; no line wider than the terminal. */
export function renderFrame({ rows, pending, tick, message, columns }: FrameInput): string[] {
  const spinner = FRAMES[tick % FRAMES.length] ?? "-";
  const marks: PendingRows = { ids: pending, icon: tone.muted(spinner) };
  const lines = [pc.gray(S_BAR), `${tone.action(spinner)}  ${message}`, pc.gray(S_BAR), ...renderTable(rows, columns - 1, marks).split("\n")];
  return lines.map((line) => fitLine(line, columns - 1));
}

/** Lines are never wider than the terminal, so each one is exactly one row on screen. */
function fitLine(line: string, width: number): string {
  const plain = stripVTControlCharacters(line);
  if (plain.length <= width) return line;
  return `${plain.slice(0, Math.max(0, width - icons.ellipsis.length))}${icons.ellipsis}`;
}

/** Rows a block of lines takes after the terminal rewrapped it to `columns`. */
export function screenRows(lines: readonly string[], columns: number): number {
  return lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(stripVTControlCharacters(line).length / Math.max(1, columns))), 0);
}

export interface LiveKeys {
  /** q: stop, nothing was changed. */
  quit(): void;
  /** Ctrl+C or Esc. */
  cancel(): void;
}

interface Input {
  isTTY?: boolean;
  isRaw?: boolean;
  isPaused?(): boolean;
  setRawMode?(mode: boolean): unknown;
  on(event: "data", listener: (data: Buffer | string) => void): unknown;
  off(event: "data", listener: (data: Buffer | string) => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

/**
 * Draws frames for `rows` until finish(). It gives up (erases itself and calls
 * onAbandon) when the frame no longer fits on the screen or the terminal is
 * resized; the caller then shows the plain spinner and the static table.
 */
export class LiveTable {
  private rows: ToolScan[];
  private readonly pending: Set<string>;
  private message: string;
  private tick = 0;
  private drawn: string[] = [];
  private timer: NodeJS.Timeout | undefined;
  private active = false;
  /** A resize arrived: drawing stopped, erase pending until the size settles. */
  private resized: NodeJS.Timeout | undefined;
  private readonly onResize = () => this.resizeStarted();
  private readonly onData = (data: Buffer | string) => this.key(String(data));
  private readonly onExit = () => this.out.write(SHOW_CURSOR);
  /** stdin as we found it, restored on stop (the prompts that follow expect it unchanged). */
  private inputWas: { raw: boolean; paused: boolean } | null = null;

  constructor(
    placeholders: readonly ToolScan[],
    message: string,
    private readonly out: NodeJS.WriteStream,
    private readonly input: Input | null,
    private readonly keys: LiveKeys,
    private readonly onAbandon: () => void,
  ) {
    this.rows = [...placeholders];
    this.pending = new Set(placeholders.map((r) => r.id));
    this.message = message;
  }

  /** Draw the first frame. false (nothing drawn) when it doesn't fit on the screen. */
  start(): boolean {
    if (!this.fits(this.frame())) return false;
    this.active = true;
    this.out.write(HIDE_CURSOR);
    process.on("exit", this.onExit);
    this.out.on("resize", this.onResize);
    if (this.input?.isTTY && this.input.setRawMode) {
      this.inputWas = { raw: Boolean(this.input.isRaw), paused: this.input.isPaused?.() ?? true };
      if (!this.inputWas.raw) this.input.setRawMode(true);
      this.input.on("data", this.onData);
      this.input.resume();
    }
    this.draw();
    this.timer = setInterval(() => this.draw(), TICK_MS);
    return true;
  }

  /** Drawing, or erasing after a resize: finish() still has work to do. */
  get isActive(): boolean {
    return this.active || this.resized !== undefined;
  }

  /** A row's result arrived (shown on the next frame). */
  update(scan: ToolScan): void {
    const i = this.rows.findIndex((r) => r.id === scan.id);
    if (i === -1) return;
    this.rows[i] = scan;
    this.pending.delete(scan.id);
  }

  setMessage(message: string): void {
    this.message = message;
  }

  /** Erase the frame and restore the terminal. */
  finish(): void {
    if (this.resized) {
      // Finished while a resize was settling: erase for the new width, no spinner needed.
      clearTimeout(this.resized);
      this.resized = undefined;
      this.eraseAfterResize();
      return;
    }
    if (!this.active) return;
    this.stop();
    this.out.write(`${this.eraseSequence(this.drawn.length)}${SHOW_CURSOR}`);
    this.drawn = [];
  }

  private frame(): string[] {
    return renderFrame({ rows: this.rows, pending: this.pending, tick: this.tick, message: this.message, columns: this.out.columns ?? 80 });
  }

  private fits(lines: readonly string[]): boolean {
    return lines.length < (this.out.rows ?? 24);
  }

  private draw(): void {
    if (!this.active) return;
    this.tick++;
    const lines = this.frame();
    if (!this.fits(lines)) return this.abandon();
    this.out.write(`${SYNC_START}${this.eraseSequence(this.drawn.length)}${lines.join("\n")}\n${SYNC_END}`);
    this.drawn = lines;
  }

  private eraseSequence(lineCount: number): string {
    return lineCount > 0 ? `${ESC}[${lineCount}A\r${ESC}[J` : "";
  }

  /** Stop live drawing, erase what is on screen, and let the caller fall back. */
  private abandon(): void {
    if (!this.active) return;
    this.stop();
    this.out.write(`${this.eraseSequence(this.drawn.length)}${SHOW_CURSOR}`);
    this.drawn = [];
    this.onAbandon();
  }

  /**
   * The terminal was resized: stop drawing at once, and once the size has
   * settled (terminals rewrap in steps, and the new width can arrive late)
   * erase the frame counting its rows at the new width, then fall back.
   */
  private resizeStarted(): void {
    if (!this.active) return;
    this.stop();
    this.resized = setTimeout(() => {
      this.resized = undefined;
      this.eraseAfterResize();
      this.onAbandon();
    }, RESIZE_SETTLE_MS);
  }

  private eraseAfterResize(): void {
    this.out.write(`${this.eraseSequence(screenRows(this.drawn, this.out.columns ?? 80))}${SHOW_CURSOR}`);
    this.drawn = [];
  }

  private stop(): void {
    this.active = false;
    clearInterval(this.timer);
    this.out.off("resize", this.onResize);
    process.off("exit", this.onExit);
    if (this.input?.isTTY && this.input.setRawMode && this.inputWas) {
      // Restore, don't force: switching the console out of raw mode here (clack
      // leaves it raw on Windows) made the next prompt lose its first keys.
      this.input.off("data", this.onData);
      if (!this.inputWas.raw) this.input.setRawMode(false);
      if (this.inputWas.paused) this.input.pause();
      this.inputWas = null;
    }
  }

  private key(data: string): void {
    if (data === "q" || data === "Q") {
      this.finish();
      this.keys.quit();
    } else if (data === "\x03" || data === ESC) {
      this.finish();
      this.keys.cancel();
    }
  }
}

/**
 * The "Checking latest versions" phase: the live table when allowed (and it
 * fits), else the usual spinner. stop() always ends with the usual
 * "◇  Latest versions checked" line, so what follows is printed as before.
 */
export function latestVersionsProgress(options: {
  live: boolean;
  placeholders: readonly ToolScan[];
  message: string;
  keys: LiveKeys;
  out?: NodeJS.WriteStream;
  input?: Input | null;
}): { message(text: string): void; update(scan: ToolScan): void; stop(text: string): void } {
  const out = options.out ?? process.stdout;
  let message = options.message;
  let spinner: Progress | null = null;
  const fallback = () => {
    spinner = createProgress();
    spinner.start(message);
  };
  const table =
    options.live && options.placeholders.length > 0
      ? new LiveTable(options.placeholders, message, out, options.input === undefined ? process.stdin : options.input, options.keys, fallback)
      : null;
  if (!table?.start()) fallback();
  return {
    message(text) {
      message = text;
      if (table?.isActive) table.setMessage(text);
      else spinner?.message(text);
    },
    update(scan) {
      table?.update(scan);
    },
    stop(text) {
      if (table?.isActive) {
        table.finish();
        // The same spinner start + stop as without the live table: identical scrollback.
        fallback();
      }
      spinner?.stop(text);
    },
  };
}