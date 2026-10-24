import { stripVTControlCharacters } from "node:util";

/*
 * Display width in terminal columns: wide East Asian characters and emoji take
 * two, combining marks and zero-width characters none. Counted per grapheme, so
 * an emoji sequence (family, flag, skin tone) counts once.
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

const ZERO_WIDTH = /^[\u200b-\u200f\u2060\ufe00-\ufe0f]$|^\p{Mn}$|^\p{Me}$/u;

/** Columns one grapheme takes. */
export function graphemeWidth(g: string): number {
  if (ZERO_WIDTH.test(g)) return 0;
  if (/\p{Extended_Pictographic}/u.test(g) && (g.length > 1 || /\p{Emoji_Presentation}/u.test(g))) return 2;
  const cp = g.codePointAt(0) ?? 0;
  if (cp < 32) return 0;
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

/** Cut plain text to at most `width` columns. */
export function sliceToWidth(text: string, width: number): string {
  let out = "";
  let used = 0;
  for (const g of graphemes(text)) {
    const w = graphemeWidth(g);
    if (used + w > width) break;
    out += g;
    used += w;
  }
  return out;
}