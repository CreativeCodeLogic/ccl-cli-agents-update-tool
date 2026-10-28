/*
 * The terminal title, kept as the user had it. On Windows the commands we run
 * share our console, and some rename it: npm sets it to "npm install
 * netlify-cli@latest", node-gyp to "node-gyp", and the name stays after they
 * exit. So the title is put back after every child process and on exit: the
 * original when it can be read, else "ccl-caut" while running, cleared on exit
 * (cmd.exe then restores its own title). Node can set the console title on
 * Windows but not read it, so in practice it is the "ccl-caut" fallback there.
 *
 * Only in a terminal, never in logs or pipes. macOS and Linux need nothing:
 * there a child can only change the title by writing to the terminal, and our
 * children's output is piped.
 */

export interface TitleHost {
  platform: NodeJS.Platform;
  isTTY: boolean;
  read: () => string;
  set: (title: string) => void;
  /** Escape sequences (the "clear on exit" fallback). */
  write: (text: string) => void;
}

const FALLBACK = "ccl-caut";

let state: { host: TitleHost; original: string | null } | null = null;

/** Start keeping the title (Windows terminals only). Returns false when there is nothing to do. */
export function keepTerminalTitle(host: TitleHost = defaultHost()): boolean {
  state = null;
  if (host.platform !== "win32" || !host.isTTY) return false;
  let original: string | null = null;
  try {
    original = host.read().trim() || null;
  } catch {
    original = null;
  }
  state = { host, original };
  if (!original) host.set(FALLBACK);
  return true;
}

/** After a child process: put the title back (no-op unless keepTerminalTitle armed it). */
export function restoreTerminalTitle(): void {
  if (!state) return;
  try {
    state.host.set(state.original ?? FALLBACK);
  } catch {
    // A title is cosmetic: never fail an update over it.
  }
}

/** On exit: the original title, or an empty one when it was never known. */
export function releaseTerminalTitle(): void {
  if (!state) return;
  const { host, original } = state;
  state = null;
  try {
    if (original) host.set(original);
    else host.write("\u001b]0;\u0007");
  } catch {
    // cosmetic
  }
}

function defaultHost(): TitleHost {
  return {
    platform: process.platform,
    isTTY: Boolean(process.stdout.isTTY),
    // Node's process.title getter gives the node executable on Windows, not the console
    // title (only the setter reaches the console): treat that as unreadable.
    read: () => (/node(\.exe)?$/i.test(process.title) || process.title === process.execPath ? "" : process.title),
    set: (title) => {
      process.title = title;
    },
    write: (text) => process.stdout.write(text),
  };
}
