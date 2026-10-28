import { exec } from "./exec";

/*
 * npm 12 blocks dependency install scripts by default (npm 12.0.0, 2026-07-08),
 * also for `npm install -g`. A global install has no package.json, so the only
 * policy is the `allow-scripts` config: the --allow-scripts flag (npm 11.16.0+),
 * or `allow-scripts` in .npmrc. Precedence (npm's resolve-allow-scripts): the
 * first layer that has a value wins for the whole install, so the flag REPLACES
 * the user's .npmrc list; we pass the union. `ignore-scripts=true` beats both
 * (nothing runs) and is the only way a user can deny scripts for -g installs:
 * we never override it, the user gets a command to run once instead.
 *
 * Packages whose own install script must run for the tool to work at all: the
 * package ships a small placeholder as its bin, and the script copies the
 * native binary from the platform package over it. Without it the command is
 * the placeholder ("claude.exe is not a valid application for this OS").
 * Checked against each package's contents (docs/npm-install-scripts.md).
 */
export const NPM_SCRIPT_NEEDED: Readonly<Record<string, string>> = {
  "@anthropic-ai/claude-code": "puts the native claude binary in place",
  "@ampcode/cli": "puts the native amp binary in place",
  "opencode-ai": "puts the native opencode binary in place",
  "@opencode/cli": "puts the native opencode binary in place",
};

/** The npm on PATH and the user's install-script settings (`npm config get`). */
export interface NpmScriptPolicy {
  /** `npm -v`; null when npm didn't answer. */
  version: string | null;
  /** The user's allow-scripts list (user/global .npmrc, env). */
  allowScripts: string[];
  /** ignore-scripts=true: the user turned install scripts off. */
  ignoreScripts: boolean;
  /** dangerously-allow-all-scripts=true: every script runs anyway. */
  allowAll: boolean;
}

/** major.minor.patch of an npm version ("12.2.1", "11.16.0-pre.1" -> [11, 16, 0]). */
function parts(version: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function atLeast(version: string | null, min: [number, number, number]): boolean {
  const v = version ? parts(version) : null;
  if (!v) return false;
  for (let i = 0; i < 3; i++) if (v[i] !== min[i]) return v[i]! > min[i]!;
  return true;
}

/** npm understands --allow-scripts (older npm only warns "Unknown cli config"). */
export const supportsAllowScripts = (version: string | null) => atLeast(version, [11, 16, 0]);

/** npm blocks unreviewed install scripts by default. */
export const blocksScriptsByDefault = (version: string | null) => atLeast(version, [12, 0, 0]);

/** Parse `npm config get allow-scripts ignore-scripts dangerously-allow-all-scripts` (key=value lines). */
export function parseNpmConfig(stdout: string): Omit<NpmScriptPolicy, "version"> {
  const values = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const at = line.indexOf("=");
    if (at > 0) values.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  const list = values.get("allow-scripts") ?? "";
  return {
    allowScripts: list && list !== "undefined" && list !== "null" ? list.split(",").map((s) => s.trim()).filter(Boolean) : [],
    ignoreScripts: values.get("ignore-scripts") === "true",
    allowAll: values.get("dangerously-allow-all-scripts") === "true",
  };
}

let policy: Promise<NpmScriptPolicy> | undefined;

/** The npm on PATH: version and install-script settings, read once per run. */
export function getNpmScriptPolicy(): Promise<NpmScriptPolicy> {
  policy ??= (async () => {
    const [v, config] = await Promise.all([
      exec("npm", ["-v"]),
      exec("npm", ["config", "get", "allow-scripts", "ignore-scripts", "dangerously-allow-all-scripts"]),
    ]);
    const version = v.ok ? v.stdout.trim() || null : null;
    return { version, ...(config.ok ? parseNpmConfig(config.stdout) : { allowScripts: [], ignoreScripts: false, allowAll: false }) };
  })();
  return policy;
}

/** Use a known policy instead of asking npm (tests, demo). */
export function primeNpmScriptPolicy(value: NpmScriptPolicy | null): void {
  policy = value ? Promise.resolve(value) : undefined;
}

/** `--allow-scripts=<the user's list + names>` (deduplicated, the user's entries first). */
export function allowScriptsFlag(names: readonly string[], p: NpmScriptPolicy): string {
  return `--allow-scripts=${[...new Set([...p.allowScripts, ...names])].join(",")}`;
}

export type NpmScriptArgs =
  /** Extra arguments for `npm install -g <pkg>` (none when not needed or not supported). */
  | { kind: "args"; args: string[] }
  /** The user turned install scripts off (ignore-scripts=true): don't override; this runs it once. */
  | { kind: "denied"; command: string; reason: string };

/**
 * What `npm install -g <pkg>@<spec>` needs so the package's own install script
 * runs: nothing when the package doesn't need one, npm runs scripts anyway
 * (before 11.16.0 the flag doesn't exist; dangerously-allow-all-scripts), or a
 * --allow-scripts flag that keeps the user's own list.
 */
export function npmScriptArgs(pkg: string, spec: string, p: NpmScriptPolicy): NpmScriptArgs {
  const why = NPM_SCRIPT_NEEDED[pkg];
  if (!why || !supportsAllowScripts(p.version)) return { kind: "args", args: [] };
  if (p.ignoreScripts) {
    return {
      kind: "denied",
      command: `npm install -g --ignore-scripts=false ${allowScriptsFlag([pkg], p)} ${pkg}@${spec}`,
      reason: `Your npm config turns install scripts off (ignore-scripts=true), and ${pkg} needs its install script (it ${why}). CCL CAUT won't override that; run this to allow it once:`,
    };
  }
  if (p.allowAll) return { kind: "args", args: [] };
  return { kind: "args", args: [allowScriptsFlag([pkg], p)] };
}

/** One package whose install scripts npm skipped. */
export interface BlockedScripts {
  pkg: string;
  version: string;
  /** e.g. "postinstall: node install.cjs" */
  scripts: string;
}

// npm 12: "npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:"
// (npm 11.19 wording: "1 package has install scripts not yet covered by allowScripts:"), then one
// "npm warn install-scripts   <name>@<version> (<event>: <command>[; ...])" line per package.
const HEADER = /install-scripts\s+\d+ packages? (?:had install scripts blocked|ha(?:s|ve) install scripts not yet covered)/;
const ENTRY = /^npm warn install-scripts\s{2,}(@?[^@\s]+)@(\S+) \((.+)\)\s*$/;

/** The packages npm says it skipped install scripts for, from an install's output. */
export function parseBlockedScripts(output: string): BlockedScripts[] {
  const out: BlockedScripts[] = [];
  let inList = false;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.replace(/\u001b\[[0-9;]*m/g, "").trimEnd();
    if (HEADER.test(line)) {
      inList = true;
      continue;
    }
    if (!inList) continue;
    const m = ENTRY.exec(line);
    if (m) out.push({ pkg: m[1]!, version: m[2]!, scripts: m[3]! });
    else if (!/^npm warn install-scripts\s*$/.test(line)) inList = false;
  }
  return out;
}

/** The package an `npm install -g ... <pkg>@<spec>` command installs (the last non-flag argument). */
export function installedPackageOf(args: readonly string[]): string | null {
  const spec = [...args].reverse().find((a) => a && !a.startsWith("-") && a !== "install" && a !== "i");
  if (!spec) return null;
  const at = spec.indexOf("@", 1);
  return at > 0 ? spec.slice(0, at) : spec;
}

/**
 * The command that repairs a global npm install whose tool doesn't run: the
 * package's own blocked script if npm named it (or one it is known to need),
 * else the blocked dependencies' scripts (the minimal allow), else a plain
 * reinstall. Keeps the user's allow list; never overrides ignore-scripts
 * silently (the reason says so and the command turns it off for this run only).
 */
export function npmRepairCommand(pkg: string, blocked: readonly BlockedScripts[], p: NpmScriptPolicy): { command: string; reason: string } {
  const own = blocked.some((b) => b.pkg === pkg) || Boolean(NPM_SCRIPT_NEEDED[pkg]);
  const names = own ? [pkg] : [...new Set(blocked.map((b) => b.pkg))];
  const flags: string[] = [];
  if (names.length > 0 && supportsAllowScripts(p.version)) {
    if (p.ignoreScripts) flags.push("--ignore-scripts=false");
    flags.push(allowScriptsFlag(names, p));
  }
  const command = ["npm install -g", ...flags, `${pkg}@latest`].join(" ");
  const scripts = blocked.filter((b) => names.includes(b.pkg)).map((b) => `${b.pkg} (${b.scripts})`);
  const reason =
    names.length === 0
      ? "Reinstall it with npm."
      : p.ignoreScripts
        ? `Your npm config turns install scripts off (ignore-scripts=true), so ${names.join(", ")} couldn't finish installing. This runs ${names.length === 1 ? "its script" : "their scripts"} once:`
        : `npm ${scripts.length > 0 ? `blocked ${scripts.join(", ")}` : `didn't run ${names.join(", ")}'s install script`}, which the tool needs to run. This allows ${names.length === 1 ? "that package" : "those packages"} only:`;
  return { command, reason };
}
