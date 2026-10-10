import { S_BAR, unicodeOr } from "@clack/prompts";
import { stripVTControlCharacters } from "node:util";
import pc from "picocolors";
import { tone } from "./theme";

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

/** Cut a line to `width` visible columns (ANSI-free input). */
export function fitToWidth(text: string, width: number): string {
  const clean = stripVTControlCharacters(text).replace(/\s+$/, "");
  return clean.length <= width ? clean : `${clean.slice(0, Math.max(0, width - 1))}…`;
}

/**
 * A two-line live status for one running update, redrawn every 100ms:
 *   ◐  Updating Codex CLI  0:07 · fetched 23 files
 *   │  <latest line of the updater's output, dimmed>
 * Not a TTY: one static line, no animation. stop() erases it.
 */
export class LiveStatus {
  private frame = 0;
  private timer: NodeJS.Timeout | undefined;
  private drawn = 0;
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

  private erase(): void {
    if (this.drawn === 0) return;
    this.out.write(`\x1b[${this.drawn}A\r\x1b[J`);
    this.drawn = 0;
  }

  private draw(): void {
    const width = Math.max(20, (this.out.columns ?? 80) - 4);
    const spinner = tone.action(FRAMES[this.frame++ % FRAMES.length] ?? "-");
    const status = [this.elapsed(), this.counter].filter(Boolean).join(" · ");
    const lines = [pc.gray(S_BAR), `${spinner}  ${this.title}  ${tone.muted(status)}`];
    if (this.latest) lines.push(`${pc.gray(S_BAR)}  ${tone.muted(fitToWidth(this.latest, width))}`);
    this.erase();
    this.out.write(`${lines.join("\n")}\n`);
    this.drawn = lines.length;
  }
}