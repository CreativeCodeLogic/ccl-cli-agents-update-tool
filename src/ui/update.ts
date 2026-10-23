import path from "node:path";
import { log } from "@clack/prompts";
import type { BinaryInstance, ToolDescriptor, ToolScan } from "../types";
import type { VersionCache } from "../utils/cache";
import { debug } from "../utils/debug";
import { execCapture, type TeeResult } from "../utils/exec";
import { getHost } from "../utils/host";
import { getNpmGlobalPaths } from "../utils/npm";
import { isUnderProgramFiles } from "../utils/paths";
import { sameVersion } from "../utils/version";
import { LiveStatus } from "./live";
import { CANCEL_EXIT_CODE } from "./progress";
import { simulated } from "./demo-notice";
import { SELF_ID, selfUpdateFailureHint } from "../selfupdate";
import { isWingetCommand, wingetExitKind } from "../utils/winget";
import { icons } from "./symbols";
import { tone } from "./theme";

/** A selected tool plus what we need to update and re-check the copy that runs. */
export interface UpdateTarget {
  scan: ToolScan;
  tool: ToolDescriptor;
  instance: BinaryInstance;
}

/**
 * Runs one auto-update command, handing its output to `onChunk` as it arrives.
 * The real one captures a child process; demo mode fakes it.
 */
export type UpdateExecutor = (
  command: string,
  args: string[],
  target: UpdateTarget,
  onChunk: (text: string) => void,
) => Promise<TeeResult>;

const isNpmInstall = (command: string, args: readonly string[]) =>
  path.parse(command).name.toLowerCase() === "npm" && args[0] === "install";

/** npm hides its progress when not on a TTY; http-level logging gives us one line per fetched file. */
export function withNpmProgress(command: string, args: string[]): string[] {
  return isNpmInstall(command, args) && !args.some((a) => a.startsWith("--loglevel")) ? [...args, "--loglevel=http"] : args;
}

const runForReal: UpdateExecutor = (command, args, _target, onChunk) => execCapture(command, withNpmProgress(command, args), onChunk);

const NPM_HTTP = /^npm (?:http|verb) (?:fetch|cache) /;

/** Follows an updater's output: the latest meaningful line, npm fetch count, and a tail for failures. */
export class OutputTracker {
  private pending = "";
  private readonly lines: string[] = [];
  latest = "";
  fetched = 0;

  feed(text: string): void {
    const parts = (this.pending + text).split(/\r?\n|\r/);
    this.pending = parts.pop() ?? "";
    for (const raw of parts) this.take(raw);
  }

  /** Flush a final line without a newline. */
  end(): void {
    if (this.pending) this.take(this.pending);
    this.pending = "";
  }

  counter(): string {
    return this.fetched > 0 ? `fetched ${this.fetched} file${this.fetched === 1 ? "" : "s"}` : "";
  }

  tail(n: number): string[] {
    return this.lines.slice(-n);
  }

  private take(raw: string): void {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) return;
    this.lines.push(line);
    if (this.lines.length > 500) this.lines.shift();
    if (NPM_HTTP.test(line)) this.fetched++;
    else this.latest = line;
  }
}

export interface UpdateOutcome {
  updated: number;
  /** Command succeeded but the running copy reports the same version. */
  unchanged: number;
  /** Command succeeded, version unchanged for an expected reason (staged rollout). */
  held: number;
  /** A self-updating tool's own updater ran and it was already current. */
  current: number;
  failed: number;
  manual: number;
  /** Ctrl+C was pressed during an update; remaining tools were skipped. */
  interrupted: boolean;
  /** Tools whose re-check showed the new version. */
  updatedIds: string[];
  /** Tools whose update command failed (they go on the "still to do" list). */
  failedIds: string[];
}

/**
 * Exit code after updates: 130 when interrupted, 1 when an update failed, did
 * not apply, or was skipped (--yes: running, needs admin, Claude Code session),
 * else 0.
 */
export function updateExitCode(outcome: Pick<UpdateOutcome, "interrupted" | "failed" | "unchanged">, skipped: number): number {
  if (outcome.interrupted) return CANCEL_EXIT_CODE;
  return outcome.failed > 0 || outcome.unchanged > 0 || skipped > 0 ? 1 : 0;
}

/** Readable form of an auto command: absolute executable paths shown by name. */
export function displayCommand(command: readonly string[]): string {
  const [bin = "", ...args] = command;
  const name = path.isAbsolute(bin) ? path.parse(bin).name : bin;
  return [name, ...args].join(" ");
}

const LOCK_RE = /EBUSY|EPERM|operation not permitted|resource busy|being used by another process/i;

/** Turn a failed update's output into an actionable hint, or null. */
export async function diagnose(output: string, toolName: string, command: readonly string[]): Promise<string | null> {
  const isNpm = path.parse(command[0] ?? "").name.toLowerCase() === "npm";
  if (isNpm) {
    const prefix = (await getNpmGlobalPaths())?.prefix;
    const adminPrefix = prefix !== undefined && isUnderProgramFiles(prefix);
    if (/EACCES/i.test(output) || (adminPrefix && /EPERM/i.test(output))) {
      return getHost().platform === "win32"
        ? "npm cannot write to its global folder; run ccl-caut from a terminal opened with Run as administrator."
        : "npm cannot write to its global prefix. Avoid sudo npm; use a Node version manager or set a user-owned prefix.";
    }
  }
  if (LOCK_RE.test(output)) {
    return `${toolName} appears to be running (another terminal, VS Code). Close it and run ccl-caut again.`;
  }
  return null;
}

/**
 * A manual command on its own clean line: no gutter, no box, no trailing
 * spaces, a blank line before and after, so selecting it copies exactly the command.
 */
export function printManualCommand(name: string, command: string, reason: string, out: NodeJS.WritableStream = process.stdout): void {
  log.step(`${tone.action(name)}: run this yourself`);
  log.message(tone.muted(reason));
  out.write(`\n${command.trim()}\n\n`);
}

/** Run (auto) or print (manual) the plan for each selected tool, sequentially. */
export async function applyUpdates(
  targets: readonly UpdateTarget[],
  cache: VersionCache | null = null,
  executor: UpdateExecutor = runForReal,
): Promise<UpdateOutcome> {
  const outcome: UpdateOutcome = { updated: 0, unchanged: 0, held: 0, current: 0, failed: 0, manual: 0, interrupted: false, updatedIds: [], failedIds: [] };

  // The running child gets Ctrl+C too and cleans up after itself; we just
  // stop before the next tool instead of exiting mid-install.
  const onInterrupt = () => {
    outcome.interrupted = true;
  };
  process.on("SIGINT", onInterrupt);

  try {
    for (const target of targets) {
      if (outcome.interrupted) break;
      const { scan, tool, instance } = target;
      const plan = scan.plan;
      if (!plan) continue;

      if (plan.kind === "manual") {
        outcome.manual++;
        printManualCommand(scan.name, plan.command, plan.reason);
        continue;
      }

      const [command, ...args] = plan.command;
      if (!command) continue;
      const tracker = new OutputTracker();
      const live = new LiveStatus(`Updating ${tone.focus(scan.name)}${simulated()}  ${tone.muted(`$ ${displayCommand(plan.command)}`)}`);
      live.start();
      const result = await executor(command, args, target, (text) => {
        tracker.feed(text);
        live.update(tracker.latest, tracker.counter());
      });
      tracker.end();
      const elapsed = live.elapsed();
      live.stop();
      if (process.env.CCL_CAUT_DEBUG) debug(`${scan.name} output:\n${result.output}`);

      // winget: "no applicable update" means its repository doesn't have the version yet.
      const wingetKind = result.code !== 0 && isWingetCommand(plan.command) ? wingetExitKind(result.code) : null;
      if (wingetKind === "not-applicable") {
        outcome.held++;
        log.warn(tone.action(`${scan.name}: waiting for winget. It doesn't offer ${scan.latestVersion ?? "the new version"} yet; nothing was changed. Try again later.`));
        continue;
      }
      if (result.code !== 0) {
        outcome.failed++;
        outcome.failedIds.push(scan.id);
        log.error(tone.bad(`${scan.name} update failed${result.code === null ? "" : ` (exit code ${result.code})`} after ${elapsed}`));
        const tail = tracker.tail(20);
        if (tail.length > 0) log.message(tone.muted(tail.join("\n")));
        const selfHint = scan.id === SELF_ID && scan.latestVersion ? selfUpdateFailureHint(result.output, scan.latestVersion) : null;
        const wingetHint =
          wingetKind === "in-use"
            ? `${scan.name} is running. Close it and run ccl-caut again.`
            : wingetKind === "needs-admin"
              ? "winget needs administrator rights for this package; run the command from an elevated terminal."
              : null;
        const hint = selfHint ?? wingetHint ?? (await diagnose(result.output, scan.name, plan.command));
        if (hint) log.info(tone.action(hint));
        if (scan.id === SELF_ID) printManualCommand(scan.name, plan.command.join(" "), "Or update it yourself:");
        continue;
      }
      // The command ran: whatever we cached about this tool is stale now.
      cache?.dropTool(tool.id);

      // Re-check the copy that actually runs: catches shadowing and PATH caching.
      const before = scan.installedVersion;
      const after = await tool.getInstalledVersion(instance).catch(() => null);
      if (after && !sameVersion(before, after)) {
        outcome.updated++;
        outcome.updatedIds.push(scan.id);
        log.success(`${scan.name} ${tone.muted(before ?? "?")} ${icons.arrow} ${tone.done(after)}${simulated()}  ${tone.muted(elapsed)}`);
        continue;
      }
      if (scan.state === "self-updating" && after) {
        outcome.current++;
        log.success(`${scan.name} is current (${tone.done(after)})  ${tone.muted(elapsed)}`);
        continue;
      }
      const explained = tool.explainUnchanged?.(instance, result.output) ?? null;
      if (explained) {
        outcome.held++;
        log.warn(tone.action(explained.message));
      } else {
        outcome.unchanged++;
        log.warn(
          tone.action(
            `${scan.name}: the update command finished but the running copy still reports ${after ?? "an unknown version"}. ` +
              "Another install may be shadowing it, or a new terminal is needed.",
          ),
        );
        const tail = tracker.tail(20);
        if (tail.length > 0) log.message(tone.muted(tail.join("\n")));
      }
    }
  } finally {
    process.off("SIGINT", onInterrupt);
    cache?.save();
  }

  if (outcome.interrupted) log.warn("Interrupted: remaining updates were skipped.");
  return outcome;
}