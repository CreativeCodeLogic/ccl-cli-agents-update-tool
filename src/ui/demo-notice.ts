import pc from "./colors";

/*
 * Demo mode must be impossible to miss: testers thought `--demo` updated real
 * tools. The notice goes under the header, at the very end, and at the top and
 * bottom of every prompt; demo updates are labelled "(simulated)". It is plain
 * ASCII (a line of "=" above and below), readable in classic consoles and
 * without colors; with colors the text is a reversed amber bar.
 */

export const DEMO_NOTICE =
  "DEMO MODE: sample data only. Nothing on this computer is installed, updated or changed. Tool names and versions are made up for the demo.";

let active = false;

/** Turned on once for a `--demo` run. */
export function setDemoMode(on: boolean): void {
  active = on;
}

export function demoMode(): boolean {
  return active;
}

/** Words wrapped to `width` columns (a word longer than that keeps its own line). */
export function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

const bar = (text: string, width: number) => pc.bold(pc.inverse(pc.yellow(` ${text.padEnd(width)} `)));

/** The full notice: "=" rule, the text (a reversed bar with colors), "=" rule. */
export function demoBlock(columns: number = process.stdout.columns ?? 80): string[] {
  const width = Math.max(20, Math.min(columns, 100) - 4);
  const lines = wrapWords(DEMO_NOTICE, width);
  const inner = Math.max(...lines.map((l) => l.length));
  const rule = pc.yellow("=".repeat(inner + 2));
  return [rule, ...lines.map((l) => (pc.isColorSupported ? bar(l, inner) : ` ${l}`)), rule];
}

/** The notice inside a prompt (after the gutter): a reversed bar, or "!!"-marked lines without colors. */
export function demoPromptLines(columns: number = process.stdout.columns ?? 80): string[] {
  const width = Math.max(20, Math.min(columns, 100) - 10);
  const lines = wrapWords(DEMO_NOTICE, width);
  const inner = Math.max(...lines.map((l) => l.length));
  return lines.map((l) => (pc.isColorSupported ? bar(l, inner) : `!! ${l}`));
}

/** " (simulated)" after an update label in demo mode, else "". */
export const simulated = (): string => (active ? " (simulated)" : "");