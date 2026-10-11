import { log, spinner } from "@clack/prompts";

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
      s.stop(message);
    },
  };
}

export function createProgress(): Progress {
  return process.stdout.isTTY ? spinnerProgress() : plainProgress();
}
