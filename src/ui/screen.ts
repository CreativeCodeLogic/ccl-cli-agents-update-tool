/**
 * Start interactive runs on a clean screen without destroying anything: print
 * one newline per terminal row so everything on screen scrolls into the
 * scrollback, then move the cursor home. Never erases scrollback (no CSI 3J).
 */
export function clearScreenKeepScrollback(out: NodeJS.WriteStream = process.stdout): void {
  const rows = out.rows && out.rows > 0 ? out.rows : 24;
  out.write(`${"\n".repeat(rows)}\x1b[H`);
}

export interface ClearDecision {
  /** Interactive flow (not --check, --json or --yes). */
  interactive: boolean;
  isTTY: boolean;
  env: Readonly<Record<string, string | undefined>>;
  noClear: boolean;
  /** Demo recordings run in CI but should still start on a clean screen. */
  demo: boolean;
}

export function shouldClearScreen({ interactive, isTTY, env, noClear, demo }: ClearDecision): boolean {
  if (!interactive || !isTTY || noClear) return false;
  return demo || !env.CI;
}