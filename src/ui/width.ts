import { stripVTControlCharacters } from "node:util";

/*
 * Display width in terminal columns: wide East Asian characters and emoji take
 * two, combining marks and zero-width characters none. Counted per grapheme, so
 * an emoji sequence (family, flag, skin tone) counts once. Used to keep our own
 * lines inside the window: a line the terminal wraps loses the "│" gutter and
 * breaks redraws that move the cursor up by a line count.
 */

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

const ZERO_WIDTH = /^[​-‏⁠︀-️]$|^\p{Mn}$|^\p{Me}$/u;

/** Columns one grapheme takes (a tab counts as one column; callers expand tabs first). */
export function graphemeWidth(g: string): number {
  if (ZERO_WIDTH.test(g)) return 0;
  if (/\p{Extended_Pictographic}/u.test(g) && (g.length > 1 || /\p{Emoji_Presentation}/u.test(g))) return 2;
  const cp = g.codePointAt(0) ?? 0;
  if (cp < 32) return cp === 9 ? 1 : 0;
  return isWide(cp) ? 2 : 1;
}

export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/** Columns a string takes (styling escape codes ignored). */
export function displayWidth(text: string): number {
  let width = 0;
  for (const g of graphemes(stripVTControlCharacters(text))) width += graphemeWidth(g);
  return width;
}

/** Rows a line takes in a window `columns` wide (an empty line still takes one). */
export function rowsFor(text: string, columns: number): number {
  return Math.max(1, Math.ceil(displayWidth(text) / Math.max(1, columns)));
}

/** Plain text (no escape codes) cut to at most `width` columns, "…" marking the cut. */
export function fitWidth(text: string, width: number, ellipsis = "…"): string {
  if (displayWidth(text) <= width) return text;
  if (width <= 0) return "";
  const room = width - displayWidth(ellipsis);
  let out = "";
  let used = 0;
  for (const g of graphemes(text)) {
    const w = graphemeWidth(g);
    if (used + w > room) break;
    out += g;
    used += w;
  }
  return `${out}${ellipsis}`;
}

const SGR = /\u001b\[[0-9;]*m/g;
const COMMAND_START = /^(?:sudo|npx|npm|pnpm|yarn|brew|winget|scoop|irm|iwr|curl|pipx|uv|pip|pip3|python3?|volta|ccl-caut|gcloud|gh|amp|kimi|claude|codex|opencode|wrangler|vercel|netlify|firebase|supabase)$/;

/**
 * Word-wrap one paragraph (may carry color codes) to `width` columns. Never
 * breaks inside a word, a URL, a `backticked span`, or a command that runs to
 * the end of the text (it gets a line of its own instead; if that is still too
 * long the terminal may wrap it, but a copied command stays intact).
 */
function wrapParagraph(text: string, width: number): string[] {
  const plain = stripVTControlCharacters(text);
  if (displayWidth(plain) <= width) return [text];
  // A command on a line of its own ("npm install -g x@latest", "irm … | iex") is never broken.
  if (isCommandLine(plain)) return [text];
  // Tokens: words, with backticked spans and a trailing command kept whole.
  const raw = text.split(" ");
  const tokens: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    let token = raw[i]!;
    const bare = stripVTControlCharacters(token);
    if (bare.startsWith("`") && !(bare.length > 1 && bare.endsWith("`"))) {
      while (i + 1 < raw.length && !stripVTControlCharacters(token).replace(/^`/, "").includes("`")) token += ` ${raw[++i]}`;
    } else if (COMMAND_START.test(bare) && i > 0 && /:$/.test(stripVTControlCharacters(raw[i - 1]!)) && i + 1 < raw.length) {
      token = raw.slice(i).join(" ");
      i = raw.length;
    }
    tokens.push(token);
  }
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    const candidate = line ? `${line} ${token}` : token;
    if (line && displayWidth(candidate) > width) {
      lines.push(line);
      line = token;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return carryStyles(lines);
}

/** A copyable command: a command word first, and a flag, package spec, pipe, chain or URL in it. */
export function isCommandLine(plain: string): boolean {
  const text = plain.trim();
  // Prose has sentence punctuation ("npm blocked x (postinstall: …), which …"); a command doesn't.
  if (/[.,;:!?)](?=\s)/.test(text.replace(/\s&&\s/g, " "))) return false;
  const [first = "", second = "", ...rest] = text.split(/\s+/);
  if (!COMMAND_START.test(first)) return false;
  if (/^(?:npm|npx|pnpm|yarn)$/.test(first) && !/^(?:-|install$|i$|uninstall$|update$|upgrade$|config$|exec$|add$|remove$|dlx$|rebuild$|view$)/.test(second)) return false;
  return [second, ...rest].some((t) => /^-|@|^\||^&&$|:\/\//.test(t));
}

/** A style opened on one line (e.g. a color) is closed at its end and reopened on the next. */
function carryStyles(lines: string[]): string[] {
  let open = "";
  return lines.map((line) => {
    const out = open + line;
    for (const code of line.match(SGR) ?? []) {
      const n = code.slice(2, -1);
      if (n === "0" || n === "") open = "";
      else if (/^(?:22|23|24|27|28|29|39|49)$/.test(n)) open = open.split(/(?=\u001b\[)/).filter((c) => !closes(n, c.slice(2, -1))).join("");
      else open += code;
    }
    return open ? `${out}\u001b[0m` : out;
  });
}

function closes(closer: string, opener: string): boolean {
  const first = Number(opener.split(";")[0]);
  switch (closer) {
    case "39":
      return (first >= 30 && first <= 38) || (first >= 90 && first <= 97);
    case "49":
      return (first >= 40 && first <= 48) || (first >= 100 && first <= 107);
    case "22":
      return first === 1 || first === 2;
    default:
      return String(first) === String(Number(closer) - 20);
  }
}

/** Word-wrap text to `width` columns, keeping its own line breaks. */
export function wrapWords(text: string, width: number): string[] {
  return text.split("\n").flatMap((paragraph) => (paragraph ? wrapParagraph(paragraph, Math.max(10, width)) : [""]));
}
