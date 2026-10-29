import { stripVTControlCharacters } from "node:util";
import { icons } from "./symbols";
import { tone } from "./theme";
import { displayWidth, fitWidth, wrapWords } from "./width";

/*
 * Prompt lines that must stay on one row (checklist rows, picker rows, the
 * collapsed answer). clack hard-wraps a line wider than the window at column
 * 0, without the "│" gutter ("…· needs" / "admin"), and its redraws then count
 * rows wrong. So every such line is fitted to the window here, by display
 * width (CJK and emoji count two).
 */

const SEP = " · ";

/**
 * Hint parts by importance (0 = keep longest) and their short form:
 *  0 "needs admin": without an elevated terminal the update fails, so it must stay visible.
 *  1 "retired, opt-in": the tool's state (why it isn't preselected).
 *  2 how it updates ("runs automatically", "manual: command will be shown", "updates itself…"):
 *    useful but repeated after the update (the command is printed), so it gives way first.
 *  3 anything else.
 */
const PARTS: { match: RegExp; rank: number; short: string }[] = [
  { match: /^needs admin$/, rank: 0, short: "admin" },
  { match: /^retired, opt-in$/, rank: 1, short: "retired" },
  { match: /^manual: command will be shown$/, rank: 2, short: "manual" },
  { match: /^runs automatically$/, rank: 2, short: "auto" },
  { match: /^updates itself: runs its own updater$/, rank: 2, short: "updates itself" },
];

interface Part {
  text: string;
  short: string;
  rank: number;
  /** Was it highlighted (e.g. "needs admin" in amber)? */
  styled: boolean;
}

function parse(hint: string): Part[] {
  return hint.split(SEP).map((raw) => {
    const text = stripVTControlCharacters(raw).trim();
    const known = PARTS.find((p) => p.match.test(text));
    return { text, short: known?.short ?? text, rank: known?.rank ?? 3, styled: raw !== text && /\u001b\[/.test(raw) };
  });
}

const render = (parts: readonly Part[], short: ReadonlySet<Part>) =>
  parts.map((p) => {
    const text = short.has(p) ? p.short : p.text;
    return p.styled ? tone.action(text) : text;
  }).join(SEP);

/**
 * The hint fitted to `room` columns, in steps, least important first:
 * (1) short forms for ranks 3, 2, 1; (2) drop parts of ranks 3, 2, 1 (one kept
 * at least); (3) short form of "needs admin"; (4) cut with "…".
 * Returns "" when not even a few columns are left.
 */
export function fitHint(hint: string, room: number): string {
  if (!hint) return "";
  if (displayWidth(hint) <= room) return hint;
  if (room < 4) return "";
  let parts = parse(hint);
  const short = new Set<Part>();
  const fits = () => displayWidth(render(parts, short)) <= room;
  for (const rank of [3, 2, 1]) {
    for (const p of parts) if (p.rank === rank) short.add(p);
    if (fits()) return render(parts, short);
  }
  for (const rank of [3, 2, 1]) {
    while (parts.length > 1 && parts.some((p) => p.rank === rank)) {
      const drop = parts.map((p) => p.rank).lastIndexOf(rank);
      parts = parts.filter((_, i) => i !== drop);
      if (fits()) return render(parts, short);
    }
  }
  for (const p of parts) short.add(p);
  if (fits()) return render(parts, short);
  return fitWidth(stripVTControlCharacters(render(parts, short)), room, icons.ellipsis);
}

/**
 * One checklist row: `prefix` (gutter, box), the label (name and versions,
 * always kept whole when they fit), then the hint, fitted to `width`.
 */
export function fitRow(prefix: string, label: string, hint: string | undefined, width: number, styleLabel: (s: string) => string): string {
  const head = displayWidth(prefix);
  const labelWidth = displayWidth(label);
  if (head + labelWidth > width) {
    // Not even the name and versions fit: cut them (no hint).
    return `${prefix}${styleLabel(fitWidth(stripVTControlCharacters(label), Math.max(1, width - head), icons.ellipsis))}`;
  }
  const room = width - head - labelWidth - 2;
  const fitted = hint ? fitHint(hint, room) : "";
  return `${prefix}${styleLabel(label)}${fitted ? `  ${tone.muted(fitted)}` : ""}`;
}

/** A picker row or answer line: cut with "…" when wider than `width`. */
export function fitLine(prefix: string, text: string, width: number, style: (s: string) => string): string {
  const room = Math.max(1, width - displayWidth(prefix));
  return displayWidth(text) <= room ? `${prefix}${style(text)}` : `${prefix}${style(fitWidth(stripVTControlCharacters(text), room, icons.ellipsis))}`;
}

/** "Codex CLI, Kimi Code, +3 more": as many names as fit in `width`. */
export function fitNames(names: readonly string[], width: number): string {
  const all = names.join(", ");
  if (displayWidth(all) <= width) return all;
  for (let n = names.length - 1; n >= 1; n--) {
    const text = `${names.slice(0, n).join(", ")}, +${names.length - n} more`;
    if (displayWidth(text) <= width) return text;
  }
  return fitWidth(`${names.length} selected`, width, icons.ellipsis);
}

/** Text under the gutter, word-wrapped: each line `gutter + text` (continuations keep the gutter). */
export function gutterLines(firstPrefix: string, gutter: string, text: string, width: number, style: (s: string) => string = (s) => s): string[] {
  const room = Math.max(10, width - displayWidth(firstPrefix));
  return wrapWords(text, room).map((line, i) => `${i === 0 ? firstPrefix : gutter}${style(line)}`);
}

/** The window's width for a prompt, minus one column (a full-width line can wrap early in some consoles). */
export function promptWidth(output?: NodeJS.WritableStream | { columns?: number }): number {
  const columns = (output as { columns?: number } | undefined)?.columns ?? process.stdout.columns;
  return Math.max(20, (columns && columns > 0 ? columns : 80) - 1);
}
