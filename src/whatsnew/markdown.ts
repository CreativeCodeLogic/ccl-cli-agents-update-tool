import { stripVTControlCharacters } from "node:util";
import pc from "../ui/colors";
import { icons, iconSet } from "../ui/symbols";
import { displayWidth, graphemes, graphemeWidth, sliceToWidth } from "./width";

/*
 * Minimal Markdown for release notes, as terminal lines: headings (bold),
 * bullets and numbered lists (with hanging indents), inline code, bold, links
 * as "text (short url)", code blocks, quotes and rules. HTML tags are dropped
 * (their text stays). Input must already be sanitized. Wrapping counts display
 * columns, so CJK text and emoji line up.
 */

export interface MarkdownOptions {
  width: number;
  /** ASCII bullets and rules (classic consoles). */
  ascii?: boolean;
}

/** "https://github.com/cli/cli/releases/tag/v2.102.0" -> "github.com/cli/cli/releases/tag/v2.102.0", cut to 40 columns. */
export function shortUrl(url: string, ellipsis: string = icons.ellipsis): string {
  const bare = url.replace(/^[a-z]+:\/\//i, "").replace(/^www\./, "").replace(/\/$/, "");
  return bare.length > 40 ? `${bare.slice(0, 40 - ellipsis.length)}${ellipsis}` : bare;
}

/** Inline markup -> styled text: `code`, **bold**, __bold__, [text](url), ![alt](url), <tags>. */
export function inlineMarkup(text: string, ellipsis: string = icons.ellipsis): string {
  return text
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt: string) => (alt ? `[image: ${alt}]` : "[image]"))
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, label: string, url: string) => `${label} ${pc.dim(`(${shortUrl(url, ellipsis)})`)}`)
    .replace(/`([^`]+)`/g, (_m, code: string) => pc.cyan(code))
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_m, a?: string, b?: string) => pc.bold(a ?? b ?? ""));
}

/** Word-wrap styled text to `width` columns; continuation lines get `indent`. */
export function wrap(text: string, width: number, indent = ""): string[] {
  const words = text.split(/ +/);
  const lines: string[] = [];
  let line = "";
  const room = (first: boolean) => Math.max(4, width - (first ? 0 : displayWidth(indent)));
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (displayWidth(candidate) <= room(lines.length === 0)) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A word wider than the line (a URL, CJK text without spaces): break it by columns,
    // on the plain text so no style sequence is cut in half.
    let rest = displayWidth(word) > room(lines.length === 0) ? stripVTControlCharacters(word) : word;
    while (displayWidth(rest) > room(lines.length === 0)) {
      const max = room(lines.length === 0);
      let piece = "";
      let used = 0;
      for (const g of graphemes(rest)) {
        const w = graphemeWidth(g);
        if (used + w > max) break;
        piece += g;
        used += w;
      }
      if (!piece) break;
      lines.push(piece);
      rest = rest.slice(piece.length);
    }
    line = rest;
  }
  if (line || lines.length === 0) lines.push(line);
  return lines.map((l, i) => (i === 0 ? l : `${indent}${l}`));
}

const FENCE = /^\s*(```|~~~)/;
const BLOCK_START = /^\s{0,3}(#{1,6}\s|>|\||([-*_])(\s*\2){2,}\s*$)|^\s*([-*+]|\d+[.)])\s+/;

/**
 * Markdown's lazy continuation: a hard-wrapped line that only continues a
 * paragraph or list item ("*   Updated ... root" / "    certificates ...")
 * joins it, so it wraps with the item's hanging indent. Code is left alone.
 */
export function joinContinuations(lines: readonly string[]): string[] {
  const out: string[] = [];
  let inCode = false;
  let joinable = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      inCode = !inCode;
      joinable = false;
      out.push(line);
      continue;
    }
    if (inCode || !line.trim()) {
      joinable = false;
      out.push(line);
      continue;
    }
    if (joinable && !BLOCK_START.test(line)) {
      out[out.length - 1] = `${out[out.length - 1]!.replace(/\s+$/, "")} ${line.trim()}`;
      continue;
    }
    // Headings, rules and table rows end a paragraph; list items, quotes and text lines can continue.
    joinable = !/^\s{0,3}(#{1,6}\s|\||([-*_])(\s*\2){2,}\s*$)/.test(line);
    out.push(line);
  }
  return out;
}

export function renderMarkdown(text: string, { width, ascii = false }: MarkdownOptions): string[] {
  const out: string[] = [];
  const g = iconSet(!ascii);
  const inline = (s: string) => inlineMarkup(s, g.ellipsis);
  let inCode = false;
  const blank = () => {
    if (out.length > 0 && out[out.length - 1] !== "") out.push("");
  };
  for (const raw of joinContinuations(text.replace(/\t/g, "  ").split("\n"))) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      // Code keeps its spacing: cut by columns, never re-wrapped by words.
      let rest = raw.replace(/\s+$/, "");
      do {
        const piece = sliceToWidth(rest, width - 2);
        out.push(pc.dim(`  ${piece}`));
        rest = rest.slice(piece.length);
      } while (rest.length > 0);
      continue;
    }
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      blank();
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    if (heading) {
      blank();
      out.push(...wrap(pc.bold(inline(heading[2]!)), width));
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push(pc.dim(g.rule.repeat(Math.min(width, 40))));
      continue;
    }
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      const depth = Math.min(3, Math.floor(item[1]!.replace(/\t/g, "  ").length / 2));
      const marker = /\d/.test(item[2]!) ? item[2]! : g.bullet;
      const lead = `${"  ".repeat(depth)}${marker} `;
      out.push(...wrap(`${lead}${inline(item[3]!)}`, width, " ".repeat(displayWidth(lead))));
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      const bar = pc.dim(`${g.bar} `);
      out.push(...wrap(`${bar}${inline(quote[1]!)}`, width, bar));
      continue;
    }
    out.push(...wrap(inline(line.trim()), width));
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}