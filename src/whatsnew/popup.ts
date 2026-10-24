import { stripVTControlCharacters } from "node:util";
import spawn from "cross-spawn";
import pc from "../ui/colors";
import { cellSlice, layBackdrop, type Cells, type ScreenSnapshot } from "../ui/backdrop";
import { DEMO_NOTICE } from "../ui/demo-notice";
import { sideEffectsBlocked } from "../utils/sandbox";
import { renderMarkdown, shortUrl } from "./markdown";
import { frameSet, iconSet } from "../ui/symbols";
import { sanitize } from "./sanitize";
import { displayWidth, sliceToWidth } from "./width";

/*
 * "What's new in <Tool> <version>": a framed panel on the terminal's alternate
 * screen (like less), so closing it brings back the exact previous screen, the
 * checklist and the cursor. Notes are sanitized before anything is drawn; the
 * link `o` opens is the official one from the registry, never one from the notes.
 */

/** link-only: the vendor publishes its notes on a web page only (o opens it; never scraped). */
export type PopupState = "loading" | "ready" | "error" | "none" | "link-only";

export interface PopupContent {
  tool: string;
  /** "" when CCL CAUT doesn't know the latest version. */
  version: string;
  state: PopupState;
  /** Markdown, as published (sanitized here). */
  notes?: string;
  /** The official release-notes link for this version (registry, not the notes). */
  link: string;
  /** Full history (e.g. the releases page), for "earlier changes". */
  historyLink?: string;
  /** The version installed, when older than `version`. */
  installed?: string | null;
  /** state "error": what went wrong. */
  error?: string;
  /** state "error": GitHub's rate limit (the error is then the whole message); resetAt is epoch ms. */
  rateLimit?: { resetAt: number | null };
  /** The notes were longer than CCL CAUT shows: "Notes cut here. Full notes: <link>". */
  truncated?: boolean;
  /** Demo: the DEMO MODE notice in the panel footer. */
  demo?: boolean;
}

export interface PopupView {
  cols: number;
  rows: number;
  ascii: boolean;
  /** What CCL CAUT drew underneath, one row per screen row: shown dimmed around the panel. */
  backdrop?: Cells[] | null;
  /** First body line shown. */
  scroll: number;
  /** A one-off line in the footer (e.g. "Opening github.com/..."). */
  status?: string | undefined;
}

export const MIN_COLS = 60;
export const MIN_ROWS = 15;

/** Too small for a panel: the notes are printed inline instead. */
export const fitsPopup = (cols: number, rows: number) => cols >= MIN_COLS && rows >= MIN_ROWS;

/** The panel's inner text width for a terminal this wide. */
export const innerWidth = (cols: number) => Math.min(cols - 4, 100) - 4;

const padTo = (text: string, width: number) => {
  const cut = displayWidth(text) > width ? sliceToWidth(stripVTControlCharacters(text), width) : text;
  return cut + " ".repeat(Math.max(0, width - displayWidth(cut)));
};

/** "What's new in Codex 0.164.0" (no version when it isn't known). */
export const popupTitle = (content: PopupContent) => `What's new in ${sanitize(content.tool)}${content.version ? ` ${sanitize(content.version)}` : ""}`;

/** The body lines for a state (before scrolling). */
export function bodyLines(content: PopupContent, width: number, ascii: boolean): string[] {
  const g = iconSet(!ascii);
  const official = pc.dim(`Official notes: ${content.link}`);
  switch (content.state) {
    case "loading":
      return ["", pc.dim(`Fetching notes${g.ellipsis} (q cancels)`)];
    case "error":
      return ["", content.rateLimit ? sanitize(content.error ?? "") : `Couldn't load the release notes: ${sanitize(content.error ?? "unknown error")}`, "", official];
    case "none":
      return ["", content.version ? `No release notes for ${sanitize(content.version)}.` : `CCL CAUT doesn't know the latest version of ${sanitize(content.tool)}.`, "", official];
    case "link-only":
      return ["", `${sanitize(content.tool)} publishes its release notes on the web only.`, "o opens them in your browser:", "", official];
    default: {
      const lines = renderMarkdown(sanitize(content.notes ?? ""), { width, ascii });
      return content.truncated ? [...lines, "", pc.dim(`Notes cut here. Full notes: ${content.link}`)] : lines;
    }
  }
}

/** Footer lines above the key hints (installed/history line, demo notice, status). */
function footerLines(content: PopupContent, view: PopupView, width: number): string[] {
  const lines: string[] = [];
  if (content.installed && content.historyLink) {
    lines.push(pc.dim(`You're on ${sanitize(content.installed)}; earlier changes: ${shortUrl(content.historyLink, iconSet(!view.ascii).ellipsis)}`));
  }
  if (content.demo) for (const l of wrapPlain(DEMO_NOTICE, width)) lines.push(pc.bold(pc.inverse(pc.yellow(l))));
  if (view.status) lines.push(pc.cyan(view.status));
  return lines;
}

function wrapPlain(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && displayWidth(`${line} ${word}`) > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/**
 * The whole screen (pure): a centered panel, title in the top border, the
 * scrolled body, a footer with the key hints and the position. Returns the
 * screen lines and how far the body can scroll.
 */
export function renderPopup(content: PopupContent, view: PopupView): { lines: string[]; maxScroll: number; bodyHeight: number } {
  const b = frameSet(!view.ascii);
  const g = iconSet(!view.ascii);
  const outer = Math.min(view.cols - 4, 100);
  const inner = outer - 4;
  const height = Math.max(MIN_ROWS - 2, view.rows - 2);
  const body = bodyLines(content, inner, view.ascii);
  const foot = footerLines(content, view, inner);
  const hints = `${g.upDown} scroll · PgUp/PgDn · o open in browser · q/Esc close`;
  // borders (2) + separator (1) + footer lines + hints (1)
  const bodyHeight = Math.max(1, height - 4 - foot.length);
  const maxScroll = Math.max(0, body.length - bodyHeight);
  const scroll = Math.min(Math.max(0, view.scroll), maxScroll);
  const shown = body.slice(scroll, scroll + bodyHeight);
  while (shown.length < bodyHeight) shown.push("");

  const title = ` ${popupTitle(content)} `;
  const titleText = displayWidth(title) > outer - 4 ? `${sliceToWidth(title, outer - 5 - g.ellipsis.length + 1)}${g.ellipsis} ` : title;
  const left = Math.floor((outer - 2 - displayWidth(titleText)) / 2);
  const top = `${b.tl}${b.h.repeat(left)}${pc.bold(titleText)}${b.h.repeat(outer - 2 - left - displayWidth(titleText))}${b.tr}`;
  const position = body.length > bodyHeight ? `${scroll + 1}-${Math.min(body.length, scroll + bodyHeight)} of ${body.length}` : "";
  const hintRoom = inner - (position ? displayWidth(position) + 2 : 0);
  const hintLine = `${pc.dim(padTo(hints, hintRoom))}${position ? `  ${pc.dim(position)}` : ""}`;
  const row = (text: string) => `${b.v} ${padTo(text, inner)} ${b.v}`;
  const panel = [
    top,
    ...shown.map(row),
    `${b.ml}${b.m.repeat(outer - 2)}${b.mr}`,
    ...foot.map(row),
    row(hintLine),
    `${b.bl}${b.h.repeat(outer - 2)}${b.br}`,
  ];
  const leftWidth = Math.max(0, Math.floor((view.cols - outer) / 2));
  const topPad = Math.max(0, Math.floor((view.rows - panel.length) / 2));
  const backdrop = view.backdrop;
  if (backdrop) {
    // The overlay: CCL CAUT's own last screen, dimmed, with the panel on top.
    const dimmed = (text: string) => (text.trim() ? pc.dim(pc.gray(text)) : text);
    const lines = Array.from({ length: view.rows }, (_, r) => {
      const under = backdrop[r] ?? [];
      const p = panel[r - topPad];
      if (p === undefined) return dimmed(cellSlice(under, 0, view.cols).trimEnd());
      return `${dimmed(cellSlice(under, 0, leftWidth))}${p}${dimmed(cellSlice(under, leftWidth + outer, view.cols).trimEnd())}`;
    });
    return { lines, maxScroll, bodyHeight };
  }
  const leftPad = " ".repeat(leftWidth);
  const lines = [...Array.from({ length: topPad }, () => ""), ...panel.map((l) => leftPad + l)];
  while (lines.length < view.rows) lines.push("");
  return { lines: lines.slice(0, view.rows), maxScroll, bodyHeight };
}

/** Not a TTY or too small: the notes as plain, sanitized text, then the link. */
export function inlineNotes(content: PopupContent, width: number): string {
  const lines = [popupTitle(content), ""];
  lines.push(...bodyLines(content, Math.max(20, width), true).map((l) => stripVTControlCharacters(l)));
  if (content.state === "ready") lines.push("", `Official notes: ${content.link}`);
  if (content.installed && content.historyLink) lines.push(`You're on ${sanitize(content.installed)}; earlier changes: ${content.historyLink}`);
  return `${lines.join("\n")}\n`;
}

/** Open an official link in the default browser (http/https only). false when not opened. */
export function openUrl(url: string, platform: NodeJS.Platform = process.platform): boolean {
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(url) || sideEffectsBlocked()) return false;
  const [cmd, args] = platform === "win32" ? ["explorer.exe", [url]] : platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args as string[], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

interface KeyInput {
  isTTY?: boolean;
  isRaw?: boolean;
  isPaused?(): boolean;
  setRawMode?(mode: boolean): unknown;
  on(event: "data", listener: (data: Buffer | string) => void): unknown;
  off(event: "data", listener: (data: Buffer | string) => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

export interface PopupIO {
  input: KeyInput;
  output: NodeJS.WriteStream;
  ascii: boolean;
  /** Re-hide the cursor on close (a prompt that hides it is underneath). */
  cursorHiddenAfter?: boolean;
  open?: (url: string) => boolean;
  /** Shown while `content` (a promise) is pending: tool, version and link (state becomes "loading"). */
  loading?: Omit<PopupContent, "state">;
  /** Called when the panel closes before `content` settled (q while fetching): abort the fetch. */
  cancel?: () => void;
  /**
   * Too small for the panel: "inline" (default) prints the notes as plain text
   * (--whats-new, not a TTY); "report" prints nothing and resolves "too-small",
   * so a prompt underneath can say so in one line and stay intact.
   */
  tooSmall?: "inline" | "report";
  /**
   * What CCL CAUT last drew (see ui/backdrop): shown dimmed behind the panel.
   * Not used without colors or on the ASCII console (blank background), nor
   * when it doesn't fit the window.
   */
  backdrop?: () => ScreenSnapshot | null;
}

/** How showNotes ended. */
export type ShowResult = "shown" | "inline" | "too-small";

const ESC = "\u001b";

/**
 * Show the notes; resolves when closed. `content` may be a promise (Round B:
 * fetching): the panel shows "Fetching notes…" until it settles, and q cancels.
 */
export function showNotes(content: PopupContent | Promise<PopupContent>, io: PopupIO): Promise<ShowResult> {
  const { input, output } = io;
  const cols = () => output.columns ?? 80;
  const rows = () => output.rows ?? 24;
  const tty = Boolean(output.isTTY && input.isTTY);
  if (tty && !fitsPopup(cols(), rows()) && io.tooSmall === "report") {
    if (content instanceof Promise) io.cancel?.();
    return Promise.resolve("too-small");
  }
  if (!tty || !fitsPopup(cols(), rows())) {
    return Promise.resolve(content).then((c) => {
      output.write(inlineNotes(c, cols() - 2));
      return "inline" as const;
    });
  }

  return new Promise<ShowResult>((resolve) => {
    let current: PopupContent =
      content instanceof Promise ? { ...(io.loading ?? { tool: "", version: "", link: "" }), state: "loading" } : content;
    let settled = !(content instanceof Promise);
    let scroll = 0;
    let status: string | undefined;
    let closed = false;
    const was = { raw: Boolean(input.isRaw), paused: input.isPaused?.() ?? true };
    // Taken before the alternate screen: the screen as CCL CAUT left it.
    const under = io.backdrop && pc.isColorSupported && !io.ascii ? io.backdrop() : null;

    const draw = () => {
      if (closed) return;
      const backdrop = under ? layBackdrop(under, cols(), rows()) : null;
      const { lines, maxScroll } = renderPopup(current, { cols: cols(), rows: rows(), ascii: io.ascii, scroll, status, backdrop });
      scroll = Math.min(scroll, maxScroll);
      output.write(`${ESC}[H${lines.map((l) => `${l}${ESC}[K`).join("\r\n")}`);
    };
    const close = () => {
      if (closed) return;
      closed = true;
      input.off("data", onData);
      output.off("resize", onResize);
      output.write(`${ESC}[?1049l${io.cursorHiddenAfter ? `${ESC}[?25l` : `${ESC}[?25h`}`);
      if (!settled) io.cancel?.();
      // Restore stdin outside its own data callback (q is read there): on Windows, raw mode
      // switched off and stdin paused inside it made the next prompt's setRawMode fail (EPIPE).
      setImmediate(() => {
        if (!was.raw) input.setRawMode?.(false);
        if (was.paused) input.pause();
        resolve("shown");
      });
    };
    const page = () => Math.max(1, renderPopup(current, { cols: cols(), rows: rows(), ascii: io.ascii, scroll }).bodyHeight - 1);
    const onData = (data: Buffer | string) => {
      const key = String(data);
      status = undefined;
      if (key === "q" || key === "Q" || key === ESC || key === "\u0003") return close();
      if (key === `${ESC}[A` || key === "k") scroll = Math.max(0, scroll - 1);
      else if (key === `${ESC}[B` || key === "j") scroll += 1;
      else if (key === `${ESC}[5~`) scroll = Math.max(0, scroll - page());
      else if (key === `${ESC}[6~` || key === " ") scroll += page();
      else if (key === `${ESC}[H` || key === `${ESC}[1~` || key === "g") scroll = 0;
      else if (key === `${ESC}[F` || key === `${ESC}[4~` || key === "G") scroll = Number.MAX_SAFE_INTEGER;
      else if (key === "o" || key === "O") {
        const opened = (io.open ?? openUrl)(current.link);
        status = opened ? `Opening ${shortUrl(current.link)} in your browser…` : `Open this link yourself: ${current.link}`;
      } else return;
      draw();
    };
    const onResize = () => draw();

    output.write(`${ESC}[?1049h${ESC}[?25l${ESC}[2J`);
    if (!was.raw) input.setRawMode?.(true);
    input.on("data", onData);
    input.resume();
    output.on("resize", onResize);
    draw();
    if (content instanceof Promise) {
      content.then(
        (c) => {
          settled = true;
          current = c;
          draw();
        },
        (error: unknown) => {
          settled = true;
          current = { ...current, state: "error", error: error instanceof Error ? error.message : String(error) };
          draw();
        },
      );
    }
  });
}