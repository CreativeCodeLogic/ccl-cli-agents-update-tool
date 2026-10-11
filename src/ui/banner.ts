import figlet from "figlet";
import { stripVTControlCharacters } from "node:util";
import pc from "picocolors";

/**
 * Brand color #53d2ff: 24-bit where supported, else the closest 256-color shade
 * (81 = #5fd7ff), else bright cyan. No color at all when picocolors says so
 * (NO_COLOR, --no-color, not a TTY).
 */
export function brandColor(depth: number, enabled: boolean = pc.isColorSupported): (text: string) => string {
  if (!enabled) return (text) => text;
  const open = depth >= 24 ? "\x1b[38;2;83;210;255m" : depth >= 8 ? "\x1b[38;5;81m" : "\x1b[96m";
  return (text) => text.split("\n").map((line) => `${open}${line}\x1b[39m`).join("\n");
}

const BRAND = brandColor(process.stdout.getColorDepth?.() ?? 8);
const TITLE = "CCL CAUT";
const TAGLINE = "CLI Agents Update Tool — by Creative Code Logic";

function figletArt(): string | null {
  try {
    return figlet.textSync(TITLE, { font: "ANSI Shadow" }).replace(/\s+$/, "");
  } catch {
    return null;
  }
}

/** Pad every line of a block by the same amount so the block sits centered (by visible width). */
export function centerBlock(lines: readonly string[], columns: number): string[] {
  const width = Math.max(0, ...lines.map((line) => stripVTControlCharacters(line).length));
  const pad = " ".repeat(Math.max(0, Math.floor((columns - width) / 2)));
  return lines.map((line) => pad + line);
}

/**
 * Figlet banner in the brand color when it fits; otherwise a compact one-line
 * banner trimmed to the terminal width, so narrow terminals never wrap. With
 * `center`, the art and the subtitle are each centered as a block for the width
 * at that moment (no re-centering on resize).
 */
export function bannerLines(version: string, options: { columns: number; center: boolean; color?: (text: string) => string }): string[] {
  const { columns, center } = options;
  const brand = options.color ?? BRAND;
  const place = (lines: string[]) => (center ? centerBlock(lines, columns) : lines);
  const art = figletArt();
  const artLines = art ? art.split("\n") : [];
  const artWidth = art ? Math.max(...artLines.map((line) => line.length)) : Infinity;

  if (art && artWidth <= columns) {
    return [...place(artLines).map((line) => brand(line)), ...place([pc.dim(`${TAGLINE}  v${version}`)])];
  }
  // Longest variant that fits: title + tagline + version, then title + version.
  const full = ` v${version} · ${TAGLINE}`;
  const suffix = TITLE.length + full.length <= columns ? full : ` v${version}`;
  return place([brand(TITLE) + pc.dim(suffix)]);
}

export function printBanner(version: string, notice: string | null = null, center = false): void {
  console.log();
  for (const line of bannerLines(version, { columns: process.stdout.columns ?? 80, center })) console.log(line);
  if (notice) console.log(pc.dim(notice));
  console.log();
}
