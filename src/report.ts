import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { log } from "./ui/log";
import { ask, CANCELLED, choose, QUIT } from "./ui/prompts";
import { tone } from "./ui/theme";
import { exec } from "./utils/exec";
import { getHost } from "./utils/host";
import { findAllExecutables } from "./utils/which";

/*
 * --json for people: after the JSON, a terminal user can copy it or save it.
 * Scripts (stdout not a TTY), CI and --yes get exactly the JSON, nothing else.
 * --output <file> writes the file instead, in any mode.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** Show the copy/save prompt only for a person at a terminal. */
export function wantsReportPrompt(isTTY: boolean, env: Env, yes: boolean): boolean {
  return isTTY && !env.CI && !yes;
}

export interface Command {
  command: string;
  args: string[];
}

/**
 * How to put text on the clipboard. Windows: PowerShell Set-Clipboard reading a
 * UTF-8 file (clip.exe mangles non-ASCII); macOS: pbcopy; Linux: wl-copy, else
 * xclip, else xsel (all read stdin). null when nothing is available.
 */
export function clipboardCommand(platform: NodeJS.Platform, has: (name: string) => boolean, file = "{file}"): (Command & { stdin: boolean }) | null {
  if (platform === "win32") {
    const script = `Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 -LiteralPath '${file.replace(/'/g, "''")}')`;
    return { command: "powershell", args: ["-NoProfile", "-NonInteractive", "-Command", script], stdin: false };
  }
  if (platform === "darwin") return has("pbcopy") ? { command: "pbcopy", args: [], stdin: true } : null;
  if (has("wl-copy")) return { command: "wl-copy", args: [], stdin: true };
  if (has("xclip")) return { command: "xclip", args: ["-selection", "clipboard"], stdin: true };
  if (has("xsel")) return { command: "xsel", args: ["--clipboard", "--input"], stdin: true };
  return null;
}

/**
 * A native "save as" dialog, only where one works: Windows (SaveFileDialog),
 * macOS (choose file name), Linux desktops with zenity or kdialog. Never over
 * SSH. null = don't offer "Browse…".
 */
export function browseCommand(platform: NodeJS.Platform, env: Env, has: (name: string) => boolean, defaultName: string, cwd: string): Command | null {
  if (env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY) return null;
  if (platform === "win32") {
    const q = (s: string) => s.replace(/'/g, "''");
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$d = New-Object System.Windows.Forms.SaveFileDialog",
      `$d.FileName = '${q(defaultName)}'`,
      `$d.InitialDirectory = '${q(cwd)}'`,
      "$d.Filter = 'JSON (*.json)|*.json|All files (*.*)|*.*'",
      "$d.OverwritePrompt = $true",
      "if ($d.ShowDialog() -eq 'OK') { $d.FileName }",
    ].join("; ");
    return { command: "powershell", args: ["-NoProfile", "-STA", "-Command", script] };
  }
  if (platform === "darwin") {
    const name = defaultName.replace(/["\\]/g, "");
    return { command: "osascript", args: ["-e", `POSIX path of (choose file name with prompt "Save the ccl-caut report" default name "${name}")`] };
  }
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return null;
  if (has("zenity")) return { command: "zenity", args: ["--file-selection", "--save", `--filename=${path.join(cwd, defaultName)}`] };
  if (has("kdialog")) return { command: "kdialog", args: ["--getsavefilename", path.join(cwd, defaultName)] };
  return null;
}

/** ./ccl-caut-report-YYYY-MM-DD.json (local date). */
export function defaultReportName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `ccl-caut-report-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export interface ReportFs {
  exists(file: string): boolean;
  write(file: string, text: string): void;
}

export const nodeReportFs: ReportFs = {
  exists: (file) => existsSync(file),
  write: (file, text) => writeFileSync(file, text, "utf8"),
};

/** --output <file>: write the JSON (refusing to overwrite unless --force). */
export function writeOutputFile(
  file: string,
  json: string,
  force: boolean,
  fs: ReportFs = nodeReportFs,
  demo = false,
): { ok: true; path: string; simulated: boolean } | { ok: false; error: string } {
  const target = path.resolve(file);
  if (fs.exists(target) && !force) return { ok: false, error: `${target} already exists; use --force to overwrite it` };
  if (demo) return { ok: true, path: target, simulated: true };
  try {
    fs.write(target, json.endsWith("\n") ? json : `${json}\n`);
    return { ok: true, path: target, simulated: false };
  } catch (error) {
    return { ok: false, error: `could not write ${target}: ${(error as Error).message}` };
  }
}

export interface ReportPromptDeps {
  platform: NodeJS.Platform;
  env: Env;
  cwd: string;
  now: () => Date;
  demo: boolean;
  has: (name: string) => boolean;
  run: (command: Command, input?: string) => Promise<{ ok: boolean; stdout: string }>;
  fs: ReportFs;
  choose: typeof choose;
  ask: typeof ask;
  say: (message: string) => void;
  warn: (message: string) => void;
}

export function realReportDeps(demo: boolean): ReportPromptDeps {
  const host = getHost();
  return {
    platform: process.platform,
    env: process.env,
    cwd: process.cwd(),
    now: () => new Date(),
    demo,
    has: (name) => findAllExecutables([name], host).length > 0,
    run: (command, input) => exec(command.command, command.args, 5 * 60_000, input),
    fs: nodeReportFs,
    choose,
    ask,
    say: (message) => log.success(message),
    warn: (message) => log.warn(message),
  };
}

const lineCount = (json: string) => json.trimEnd().split("\n").length;

async function copy(json: string, deps: ReportPromptDeps): Promise<void> {
  const lines = lineCount(json);
  if (deps.demo) return deps.say(`Copied ${lines} lines ${tone.muted("(demo: nothing was copied)")}`);
  let dir: string | null = null;
  try {
    let input: string | undefined;
    let command = clipboardCommand(deps.platform, deps.has);
    if (command && !command.stdin) {
      // Windows: Set-Clipboard reads a UTF-8 temp file.
      dir = mkdtempSync(path.join(os.tmpdir(), "ccl-caut-"));
      const file = path.join(dir, "report.json");
      writeFileSync(file, json, "utf8");
      command = clipboardCommand(deps.platform, deps.has, file);
    } else if (command) input = json;
    if (!command) return deps.warn("No clipboard tool found (wl-copy, xclip or xsel). Use Save to file instead.");
    const res = await deps.run(command, input);
    if (res.ok) deps.say(`Copied ${lines} lines`);
    else deps.warn("Couldn't copy to the clipboard. Use Save to file instead.");
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

/** Write after confirming any overwrite; false = the user backed out. */
async function saveTo(target: string, json: string, deps: ReportPromptDeps, alreadyConfirmed = false): Promise<"saved" | "again" | "cancel"> {
  const file = path.resolve(deps.cwd, target);
  if (!alreadyConfirmed && !deps.demo && deps.fs.exists(file)) {
    const answer = await deps.choose({
      message: `${file} already exists`,
      options: [
        { value: "overwrite", label: "Overwrite" },
        { value: "again", label: "Choose another name" },
        { value: "cancel", label: "Cancel" },
      ],
      initialValue: "again",
    });
    if (answer === "again") return "again";
    if (answer !== "overwrite") return "cancel";
  }
  if (deps.demo) {
    deps.say(`Saved ${file} ${tone.muted("(demo: nothing was written)")}`);
    return "saved";
  }
  try {
    deps.fs.write(file, json.endsWith("\n") ? json : `${json}\n`);
    deps.say(`Saved ${file}`);
    return "saved";
  } catch (error) {
    deps.warn(`Couldn't write ${file}: ${(error as Error).message}`);
    return "again";
  }
}

async function saveWithPrompt(json: string, deps: ReportPromptDeps): Promise<void> {
  let initial = `./${defaultReportName(deps.now())}`;
  for (;;) {
    const answer = await deps.ask({ message: "Save the report as", initialValue: initial, validate: (v) => (v.trim() ? undefined : "Enter a file name") });
    if (answer === CANCELLED) return;
    const outcome = await saveTo(answer.trim(), json, deps);
    if (outcome !== "again") return;
    initial = answer.trim();
  }
}

async function saveWithDialog(json: string, deps: ReportPromptDeps, dialog: Command): Promise<void> {
  const res = await deps.run(dialog);
  const chosen = res.stdout.trim().split(/\r?\n/).pop()?.trim();
  if (!res.ok || !chosen) {
    if (res.ok) return; // the dialog was cancelled
    deps.warn("The file dialog didn't open; type a path instead.");
    return saveWithPrompt(json, deps);
  }
  // Windows and macOS dialogs ask before replacing a file themselves.
  const confirmed = deps.platform === "win32" || deps.platform === "darwin";
  if ((await saveTo(chosen, json, deps, confirmed)) === "again") await saveWithPrompt(json, deps);
}

/** After the JSON in a terminal: Copy to clipboard / Save to file / (Browse…) / Done. q = Done. */
export async function reportPrompt(json: string, deps: ReportPromptDeps): Promise<void> {
  const dialog = deps.demo ? null : browseCommand(deps.platform, deps.env, deps.has, defaultReportName(deps.now()), deps.cwd);
  let initial: "copy" | "save" | "browse" | "done" = "copy";
  for (;;) {
    const options = [
      { value: "copy" as const, label: "Copy to clipboard" },
      { value: "save" as const, label: "Save to file" },
      ...(dialog ? [{ value: "browse" as const, label: "Browse…" }] : []),
      { value: "done" as const, label: "Done" },
    ];
    const answer = await deps.choose({ message: "The report above as JSON", options, initialValue: initial });
    if (answer === "done" || answer === QUIT || answer === CANCELLED || typeof answer !== "string") return;
    if (answer === "copy") await copy(json, deps);
    else if (answer === "save") await saveWithPrompt(json, deps);
    else if (answer === "browse" && dialog) await saveWithDialog(json, deps, dialog);
    initial = "done";
  }
}