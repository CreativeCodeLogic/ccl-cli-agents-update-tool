import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { ToolChoice, ToolChoices } from "../selection";
import { TOOL_GROUPS, type ToolGroup } from "../types";
import { debug } from "./debug";
import { envVar, getHost, pathFor, type Host } from "./host";
import { sideEffectsBlocked } from "./sandbox";

const APP_DIR = "ccl-caut";
const FILE_NAME = "config.json";

/**
 * The file stays readable by 1.0.x: `schema: 1` and `tools` are exactly what
 * 1.0.x reads (it ignores any other key), and newer settings are extra keys
 * (`hiddenGroups`, 1.1). A downgrade therefore keeps the per-tool selections.
 * `schema: 2` files written by 1.1 development builds are read too and
 * rewritten in this shape on load.
 */
interface ConfigFile {
  schema: 1;
  tools: Record<string, ToolChoice>;
  /** 1.1+: groups hidden with --hide-group (1.0.x ignores this key). */
  hiddenGroups?: ToolGroup[];
  /** 1.1+: the last version that showed the "Star it on GitHub" line (once per version). */
  starShownVersion?: string;
  /** 1.2+: true once --discover has run; the scan line stops suggesting it. */
  discoverUsed?: boolean;
}

const isGroup = (value: unknown): value is ToolGroup => (TOOL_GROUPS as readonly unknown[]).includes(value);

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
    private hidden: ToolGroup[],
    private starShown: string | null = null,
    private discover = false,
  ) {}

  static load(host: Host = getHost()): UserConfig {
    const dir = configDir(host);
    const file = dir ? pathFor(host.platform).join(dir, FILE_NAME) : null;
    const choices: Record<string, ToolChoice> = {};
    const hidden: ToolGroup[] = [];
    let starShown: string | null = null;
    let discover = false;
    let migrate = false;
    if (file && !sideEffectsBlocked()) {
      try {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as { schema?: unknown; tools?: unknown; hiddenGroups?: unknown; starShownVersion?: unknown; discoverUsed?: unknown } | null;
        if ((parsed?.schema !== 1 && parsed?.schema !== 2) || typeof parsed.tools !== "object" || parsed.tools === null) {
          throw new Error("unexpected config format");
        }
        for (const [id, choice] of Object.entries(parsed.tools)) if (isChoice(choice)) choices[id] = choice;
        if (typeof parsed.starShownVersion === "string") starShown = parsed.starShownVersion;
        discover = parsed.discoverUsed === true;
        if (Array.isArray(parsed.hiddenGroups)) {
          for (const group of parsed.hiddenGroups) if (isGroup(group) && !hidden.includes(group)) hidden.push(group);
        }
        migrate = parsed.schema === 2;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") debug(`ignoring config ${file}: ${String(error)}`);
      }
    }
    const config = new UserConfig(file, choices, hidden, starShown, discover);
    // A 1.1 development build wrote schema 2, which 1.0.x ignores: put it back in the shape 1.0.x reads.
    if (migrate && host) config.write(host);
    return config;
  }

  /** Groups hidden with --hide-group (persistent until --show-group). */
  /** The last version that showed the star line, if any. */
  get starShownVersion(): string | null {
    return this.starShown;
  }

  /** Remember that `version` showed the star line. Never throws. */
  markStarShown(version: string, host: Host = getHost()): void {
    this.starShown = version;
    this.write(host);
  }

  /** Whether --discover has been run (kept by --reset-selection). */
  get discoverUsed(): boolean {
    return this.discover;
  }

  /** Remember that --discover was run. Never throws. */
  markDiscoverUsed(host: Host = getHost()): void {
    this.discover = true;
    this.write(host);
  }

  get hiddenGroups(): readonly ToolGroup[] {
    return this.hidden;
  }

  /** --hide-group / --show-group. Never throws. */
  setGroupHidden(group: ToolGroup, hidden: boolean, host: Host = getHost()): void {
    this.hidden = hidden ? [...new Set([...this.hidden, group])] : this.hidden.filter((g) => g !== group);
    this.write(host);
  }

  private write(host: Host): void {
    if (!this.file || sideEffectsBlocked()) return;
    try {
      mkdirSync(pathFor(host.platform).dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      const data: ConfigFile = {
        schema: 1,
        tools: this.choices,
        ...(this.hidden.length > 0 && { hiddenGroups: this.hidden }),
        ...(this.starShown && { starShownVersion: this.starShown }),
        ...(this.discover && { discoverUsed: true }),
      };
      writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
      renameSync(tmp, this.file);
    } catch (error) {
      debug(`could not write config ${this.file}: ${String(error)}`);
    }
  }

  get toolChoices(): ToolChoices {
    return this.choices;
  }

  /** Replace the remembered choices and persist them. Never throws. */
  saveChoices(choices: Record<string, ToolChoice>, host: Host = getHost()): void {
    this.choices = { ...choices };
    this.write(host);
  }

  /** Forget every remembered choice (--reset-selection); hidden groups and the other settings stay. Never throws. */
  reset(host: Host = getHost()): void {
    this.choices = {};
    if (!this.file || sideEffectsBlocked()) return;
    if (this.hidden.length > 0 || this.starShown || this.discover) return this.write(host);
    try {
      rmSync(this.file, { force: true });
    } catch (error) {
      debug(`could not remove config ${this.file}: ${String(error)}`);
    }
  }
}