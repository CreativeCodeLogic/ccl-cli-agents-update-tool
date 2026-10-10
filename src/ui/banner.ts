import figlet from "figlet";
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

/**
 * Figlet banner in the brand color when it fits; otherwise a compact one-line
 * banner trimmed to the terminal width, so narrow terminals never wrap.
 */
export function printBanner(version: string, notice: string | null = null): void {
  const columns = process.stdout.columns ?? 80;
  const art = figletArt();
  const artWidth = art ? Math.max(...art.split("\n").map((line) => line.length)) : Infinity;

  console.log();
  if (art && artWidth <= columns) {
    console.log(BRAND(art));
    console.log(pc.dim(`${TAGLINE}  v${version}`));
  } else {
    // Longest variant that fits: title + tagline + version, then title + version.
    const full = ` v${version} · ${TAGLINE}`;
    const suffix = TITLE.length + full.length <= columns ? full : ` v${version}`;
    console.log(BRAND(TITLE) + pc.dim(suffix));
  }
  if (notice) console.log(pc.dim(notice));
  console.log();
}
