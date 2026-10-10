import figlet from "figlet";
import gradient from "gradient-string";
import pc from "picocolors";

const BRAND = gradient(["#00c6ff", "#7b5cff", "#ff4fd8"]);

/** Figlet banner with a gradient; falls back to a single line on narrow terminals. */
export function printBanner(version: string): void {
  const columns = process.stdout.columns ?? 80;
  let art: string;
  try {
    art = figlet.textSync("CCL AUT", { font: "ANSI Shadow" });
  } catch {
    art = "CCL AUT";
  }
  const widest = Math.max(...art.split("\n").map((line) => line.length));
  const output = widest <= columns ? art.replace(/\s+$/, "") : "CCL AUT";

  console.log();
  console.log(BRAND.multiline(output));
  console.log(pc.dim(`Agents Update Tool — by Creative Code Logic  v${version}`));
  console.log();
}
