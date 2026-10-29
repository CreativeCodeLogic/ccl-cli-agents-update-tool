import { log as clackLog } from "@clack/prompts";
import { wrapWords } from "./width";

/*
 * clack's log, with every message word-wrapped to the window first. clack puts
 * a symbol or the "│" gutter (3 columns) in front of each line it is given, but
 * a line wider than the window is hard-wrapped by the terminal: mid-word, and
 * the continuation has no gutter ("Antigravity C" / "LI (agy)"). Commands meant
 * to be copied never go through here (printManualCommand, Still to do).
 */

const GUTTER = 3;

/** The window's width (80 when not a terminal). */
export const terminalColumns = (out: { columns?: number } = process.stdout) => (out.columns && out.columns > 0 ? out.columns : 80);

/** Wrap a message for clack: to the window width minus the gutter. */
export function wrapForGutter(message: string, columns = terminalColumns()): string {
  // One column left free, like every fitted line (a full-width line can wrap early in some consoles).
  return wrapWords(message, columns - 1 - GUTTER).join("\n");
}

type Options = Parameters<typeof clackLog.message>[1];
const wrapped =
  (fn: (message: string, options?: Options) => void) =>
  (message = "", options?: Options) =>
    fn(wrapForGutter(message), options);

export const log = {
  message: wrapped(clackLog.message),
  info: wrapped(clackLog.info),
  success: wrapped(clackLog.success),
  step: wrapped(clackLog.step),
  warn: wrapped(clackLog.warn),
  warning: wrapped(clackLog.warn),
  error: wrapped(clackLog.error),
};
