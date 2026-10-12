import pc from "picocolors";

/*
 * Where people find docs, issues and the vendor. Used sparingly: the --help
 * footer, unexpected-error reports, and one dim "star" line per version.
 * Never in the banner or subtitle.
 */
export const REPO_URL = "https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool";
export const ISSUES_URL = `${REPO_URL}/issues`;
export const SITE_URL = "https://creativecodelogic.com";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Terminals known to render OSC 8 hyperlinks: Windows Terminal, VS Code,
 * iTerm2, WezTerm, Kitty, GNOME Terminal and other VTE terminals (0.50+),
 * Konsole. Classic conhost, unknown terminals, CI and pipes get plain text.
 */
export function supportsHyperlinks(env: Env, isTTY: boolean): boolean {
  if (!isTTY || env.CI || env.NO_HYPERLINKS) return false;
  if (env.WT_SESSION) return true;
  if (env.TERM_PROGRAM === "vscode" || env.TERM_PROGRAM === "iTerm.app" || env.TERM_PROGRAM === "WezTerm") return true;
  if (env.TERM === "xterm-kitty" || env.KITTY_WINDOW_ID) return true;
  if (env.KONSOLE_VERSION) return true;
  const vte = Number(env.VTE_VERSION);
  return Number.isFinite(vte) && vte >= 5000;
}

/**
 * The URL (or `text`, itself a URL without the scheme) as the visible text,
 * wrapped in an OSC 8 hyperlink where the terminal supports it. Selecting and
 * copying the text always gives the address.
 */
export function link(url: string, enabled: boolean, text: string = url): string {
  return enabled ? `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\` : text;
}

/** Shown after an unexpected internal failure (not after a normal "update failed"). */
export function reportBugLine(enabled: boolean): string {
  return `Please report this: ${link(ISSUES_URL, enabled)} — include \`ccl-caut --doctor\` output`;
}

/** --help footer. */
export function helpFooter(enabled: boolean): string {
  return `Docs & issues: ${link(REPO_URL, enabled)}\nBy Creative Code Logic · ${link(SITE_URL, enabled)}`;
}

/**
 * The once-per-version "star" line: only at the end of a normal interactive
 * run in a terminal, never for machine modes (--json, --check, --yes), pipes,
 * CI or the demo, and only if this version hasn't shown it yet.
 */
export function shouldShowStar(ctx: {
  version: string;
  lastShown: string | null;
  interactive: boolean;
  isTTY: boolean;
  env: Env;
  demo: boolean;
}): boolean {
  return ctx.interactive && ctx.isTTY && !ctx.env.CI && !ctx.demo && ctx.lastShown !== ctx.version;
}

export function starLine(enabled: boolean): string {
  return pc.dim(`Enjoying CCL CAUT? ⭐ Star it on GitHub: ${link(REPO_URL, enabled, REPO_URL.replace(/^https:\/\//, ""))}`);
}