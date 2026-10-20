import type { ToolState } from "../types";
import { tone } from "./theme";

/**
 * Whether the terminal can show Unicode symbols: the same rule clack uses for
 * its own symbols (so both always agree; a test checks it). Everything outside
 * Windows can; on Windows only known modern terminals can (Windows Terminal,
 * VS Code, ConEmu/cmder, JetBrains, CI), not classic conhost.
 */
export function isUnicodeSupported(env: Readonly<Record<string, string | undefined>> = process.env, platform: NodeJS.Platform = process.platform): boolean {
  if (platform !== "win32") return env.TERM !== "linux"; // Linux console (kernel)
  return (
    Boolean(env.CI) ||
    Boolean(env.WT_SESSION) ||
    Boolean(env.TERMINUS_SUBLIME) ||
    env.ConEmuTask === "{cmd::Cmder}" ||
    env.TERM_PROGRAM === "Terminus-Sublime" ||
    env.TERM_PROGRAM === "vscode" ||
    env.TERM === "xterm-256color" ||
    env.TERM === "alacritty" ||
    env.TERMINAL_EMULATOR === "JetBrains-JediTerm"
  );
}

/** Status icons, Unicode or the ASCII-ish fallbacks for classic consoles. */
export function iconSet(unicode: boolean) {
  const or = (u: string, fallback: string) => (unicode ? u : fallback);
  return {
    ok: or("✔", "√"),
    update: or("↑", "^"),
    missing: or("–", "-"),
    unknown: "?",
    arrow: or("→", "->"),
    fail: or("✖", "x"),
    rule: or("─", "-"),
    bar: or("│", "|"),
    ellipsis: or("…", "..."),
    retired: or("⊘", "x"),
    selfUpdating: or("↻", "~"),
  };
}

/** The icons for this terminal (decided once, like clack's). Tests derive expected glyphs from here. */
export const icons = iconSet(isUnicodeSupported());

export const stateStyle: Record<ToolState, { icon: string; label: string }> = {
  "up-to-date": { icon: tone.done(icons.ok), label: tone.done("up-to-date") },
  outdated: { icon: tone.action(icons.update), label: tone.action("update available") },
  "not-installed": { icon: tone.muted(icons.missing), label: tone.muted("not installed") },
  unknown: { icon: tone.muted(icons.unknown), label: tone.muted("unknown") },
  retired: { icon: tone.bad(icons.retired), label: tone.bad("retired") },
  "self-updating": { icon: tone.self(icons.selfUpdating), label: tone.self("updates itself") },
};