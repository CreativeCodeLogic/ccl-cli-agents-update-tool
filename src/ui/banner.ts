import figlet from "figlet";
import { stripVTControlCharacters } from "node:util";
import pc from "./colors";

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
const SHORT_TAGLINE = "CLI Agents Update Tool";

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
    // The tagline line under the art drops " — by Creative Code Logic" when the window is narrow.
    const tagline = [`${TAGLINE}  v${version}`, `${SHORT_TAGLINE}  v${version}`, `v${version}`].find((t) => t.length <= columns) ?? `v${version}`;
    return [...place(artLines).map((line) => brand(line)), ...place([pc.dim(tagline)])];
  }
  // Too narrow for the art: the same one-line header every option path uses.
  return place([headerLine(version, brand, columns)]);
}

/**
 * The one compact header: "CCL CAUT v1.1.0 · CLI Agents Update Tool — by Creative Code Logic",
 * the name in the brand color, left-aligned. Shared by every option path.
 */
export function headerLine(version: string, brand: (text: string) => string = BRAND, columns = Number.POSITIVE_INFINITY): string {
  // Narrow windows: without " — by Creative Code Logic", then without the tagline (never wrapped).
  const rest = [` v${version} · ${TAGLINE}`, ` v${version} · ${SHORT_TAGLINE}`, ` v${version}`].find((r) => TITLE.length + r.length <= columns) ?? ` v${version}`;
  return `${brand(TITLE)}${pc.dim(rest)}`;
}

/** banner: the big ASCII art; line: the compact header; none: nothing. */
export type HeaderStyle = "banner" | "line" | "none";

/**
 * Which header a run gets. The big banner only on the default interactive run
 * (no options besides cosmetic ones); every option path gets the compact line;
 * --json, --version, piped output and CI get none.
 */
export function headerStyle(
  options: {
    json?: boolean; version?: boolean; check?: boolean; discover?: boolean; doctor?: boolean; help?: boolean; pending?: boolean;
    only?: unknown; hideGroup?: unknown; showGroup?: unknown; resetSelection?: boolean; yes?: boolean;
  },
  isTTY: boolean,
  env: Readonly<Record<string, string | undefined>>,
): HeaderStyle {
  if (!isTTY || env.CI || options.json || options.version) return "none";
  const optionPath =
    options.check || options.discover || options.doctor || options.help || options.pending || options.only || options.hideGroup || options.showGroup || options.resetSelection || options.yes;
  return optionPath ? "line" : "banner";
}

/** Print the header for `style` (with the newer-ccl-caut notice under it, if any). */
export function printHeader(style: HeaderStyle, version: string, notice: string | null = null, center = false): void {
  if (style === "none") return;
  console.log();
  const columns = process.stdout.isTTY ? (process.stdout.columns ?? 80) - 1 : Number.POSITIVE_INFINITY;
  const lines = style === "banner" ? bannerLines(version, { columns: process.stdout.columns ?? 80, center }) : [headerLine(version, BRAND, columns)];
  for (const line of lines) console.log(line);
  if (notice) console.log(pc.dim(notice));
  console.log();
}
