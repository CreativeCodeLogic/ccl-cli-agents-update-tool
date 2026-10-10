import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { ToolChoice, ToolChoices } from "../selection";
import { debug } from "./debug";
import { envVar, getHost, pathFor, type Host } from "./host";
import { sideEffectsBlocked } from "./sandbox";

const APP_DIR = "ccl-caut";
const FILE_NAME = "config.json";

interface ConfigFile {
  schema: 1;
  tools: Record<string, ToolChoice>;
}

/**
 * OS config directory (not the cache dir, which users wipe):
 * - win32: %APPDATA%/ccl-caut
 * - darwin + linux: $XDG_CONFIG_HOME/ccl-caut, else ~/.config/ccl-caut.
 *   On macOS this follows developer CLIs (gh, git, npm-style dotfiles) rather
 *   than ~/Library/Preferences, which Apple reserves for plist preferences and
 *   which dotfile managers don't sync.
 */
export function configDir(host: Host = getHost()): string | null {
  const path = pathFor(host.platform);
  if (host.platform === "win32") {
    const appData = envVar(host, "APPDATA") ?? (host.homedir && path.join(host.homedir, "AppData", "Roaming"));
    return appData ? path.join(appData, APP_DIR) : null;
  }
  const base = envVar(host, "XDG_CONFIG_HOME") || (host.homedir && path.join(host.homedir, ".config"));
  return base ? path.join(base, APP_DIR) : null;
}

function isChoice(value: unknown): value is ToolChoice {
  return value === "update" || value === "skip";
}

/**
 * Remembered selections. Missing, corrupt or unwritable files degrade to "no
 * preferences" silently (CCL_CAUT_DEBUG says why); demo mode never touches it.
 */
export class UserConfig {
  private constructor(
    private readonly file: string | null,
    private choices: Record<string, ToolChoice>,
  ) {}

  static load(host: Host = getHost()): UserConfig {
    const dir = configDir(host);
    const file = dir ? pathFor(host.platform).join(dir, FILE_NAME) : null;
    const choices: Record<string, ToolChoice> = {};
    if (file && !sideEffectsBlocked()) {
      try {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<ConfigFile> | null;
        if (parsed?.schema !== 1 || typeof parsed.tools !== "object" || parsed.tools === null) {
          throw new Error("unexpected config format");
        }
        for (const [id, choice] of Object.entries(parsed.tools)) if (isChoice(choice)) choices[id] = choice;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") debug(`ignoring config ${file}: ${String(error)}`);
      }
    }
    return new UserConfig(file, choices);
  }

  get toolChoices(): ToolChoices {
    return this.choices;
  }

  /** Replace the remembered choices and persist them. Never throws. */
  saveChoices(choices: Record<string, ToolChoice>, host: Host = getHost()): void {
    this.choices = { ...choices };
    if (!this.file || sideEffectsBlocked()) return;
    try {
      mkdirSync(pathFor(host.platform).dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      const data: ConfigFile = { schema: 1, tools: this.choices };
      writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
      renameSync(tmp, this.file);
    } catch (error) {
      debug(`could not write config ${this.file}: ${String(error)}`);
    }
  }

  /** Forget every remembered choice (--reset-selection). Never throws. */
  reset(): void {
    this.choices = {};
    if (!this.file || sideEffectsBlocked()) return;
    try {
      rmSync(this.file, { force: true });
    } catch (error) {
      debug(`could not remove config ${this.file}: ${String(error)}`);
    }
  }
}