import figlet from "figlet";
import gradient from "gradient-string";
import pc from "picocolors";

const BRAND = gradient(["#00c6ff", "#7b5cff", "#ff4fd8"]);
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
 * Figlet banner with a gradient when it fits; otherwise a compact one-line
 * banner trimmed to the terminal width, so narrow terminals never wrap.
 */
export function printBanner(version: string, notice: string | null = null): void {
  const columns = process.stdout.columns ?? 80;
  const art = figletArt();
  const artWidth = art ? Math.max(...art.split("\n").map((line) => line.length)) : Infinity;

  console.log();
  if (art && artWidth <= columns) {
    console.log(BRAND.multiline(art));
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
