import { spinner } from "@clack/prompts";
import { log } from "./log";
import { stripVTControlCharacters } from "node:util";
import { icons } from "./symbols";
import { displayWidth, fitWidth } from "./width";

export interface Progress {
  start(message: string): void;
  /** Change the running message (spinner only). */
  message(message: string): void;
  stop(message: string): void;
}

export const CANCEL_MESSAGE = "Cancelled — nothing was changed.";
export const CANCEL_EXIT_CODE = 130;

/** Plain step lines, so CI logs and redirected output don't fill up with animation frames. */
function plainProgress(): Progress {
  return { start: () => {}, message: () => {}, stop: (message) => log.step(message) };
}

/**
 * clack spinner with consistent cancel handling. While spinning, clack puts
 * stdin in raw mode and answers Ctrl+C with process.exit(0); the only way out
 * of an active spinner is a cancel, so remap that exit to 130.
 */
function spinnerProgress(): Progress {
  const s = spinner({ cancelMessage: CANCEL_MESSAGE, onCancel: () => process.exit(CANCEL_EXIT_CODE) });
  const markCancelled = () => {
    if (!process.exitCode) process.exitCode = CANCEL_EXIT_CODE;
  };
  return {
    start(message) {
      process.on("exit", markCancelled);
      s.start(message);
    },
    message(message) {
      s.message(message);
    },
    stop(message) {
      process.off("exit", markCancelled);
      s.stop(fitStepLine(message));
    },
  };
}

export function createProgress(): Progress {
  return process.stdout.isTTY ? spinnerProgress() : plainProgress();
}

/**
 * A spinner's final line ("◇  Found 8 of 23 supported CLIs · ccl-caut --discover to see all")
 * on one row: trailing " · " parts go first (they are extras), then a cut with "…".
 */
export function fitStepLine(message: string, columns = (process.stdout.columns ?? 80) - 1): string {
  const room = columns - 3;
  const parts = message.split(" · ");
  while (parts.length > 1 && displayWidth(parts.join(" · ")) > room) parts.pop();
  const text = parts.join(" · ");
  return displayWidth(text) <= room ? text : fitWidth(stripVTControlCharacters(text), room, icons.ellipsis);
}
