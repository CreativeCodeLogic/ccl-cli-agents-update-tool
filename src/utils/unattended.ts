/**
 * Decisions for runs without a person at the terminal (cron, launchd, Task
 * Scheduler, CI, output redirected to a file): nothing may wait for input, and
 * a log file gets plain text.
 */

/**
 * Colors off when stdout is not a terminal. picocolors already does this on
 * macOS and Linux, but always colors on Windows, which put escape codes in
 * Task Scheduler logs. CI logs render colors, so CI keeps them; FORCE_COLOR
 * and --color still force them on.
 */
export function colorsOffForOutput(env: Readonly<Record<string, string | undefined>>, stdoutIsTTY: boolean, argv: readonly string[]): boolean {
  if (stdoutIsTTY || env.FORCE_COLOR || env.CI || argv.includes("--color")) return false;
  return true;
}

/**
 * stdin for update commands: a person at a terminal can still answer a prompt;
 * otherwise the command gets no stdin at all, so a prompt sees end-of-input
 * and can never wait (a scheduler may leave stdin open but silent).
 */
export function childStdin(stdinIsTTY: boolean): "inherit" | "ignore" {
  return stdinIsTTY ? "inherit" : "ignore";
}
