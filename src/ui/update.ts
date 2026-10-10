import path from "node:path";
import { box, log } from "@clack/prompts";
import pc from "picocolors";
import type { BinaryInstance, ToolDescriptor, ToolScan } from "../types";
import type { VersionCache } from "../utils/cache";
import { execTee } from "../utils/exec";
import { getHost } from "../utils/host";
import { getNpmGlobalPaths } from "../utils/npm";
import { isUnderProgramFiles } from "../utils/paths";
import { sameVersion } from "../utils/version";
import { icons } from "./symbols";

/** A selected tool plus what we need to update and re-check the copy that runs. */
export interface UpdateTarget {
  scan: ToolScan;
  tool: ToolDescriptor;
  instance: BinaryInstance;
}

export interface UpdateOutcome {
  updated: number;
  /** Command succeeded but the running copy reports the same version. */
  unchanged: number;
  /** Command succeeded, version unchanged for an expected reason (staged rollout). */
  held: number;
  failed: number;
  manual: number;
  /** Ctrl+C was pressed during an update; remaining tools were skipped. */
  interrupted: boolean;
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
        ? "npm cannot write to its global folder; run ccl-caut from an elevated (Administrator) terminal."
        : "npm cannot write to its global prefix. Avoid sudo npm; use a Node version manager or set a user-owned prefix.";
    }
  }
  if (LOCK_RE.test(output)) {
    return `${toolName} appears to be running (another terminal, VS Code). Close it and run ccl-caut again.`;
  }
  return null;
}

/** Run (auto) or print (manual) the plan for each selected tool, sequentially. */
export async function applyUpdates(targets: readonly UpdateTarget[], cache: VersionCache | null = null): Promise<UpdateOutcome> {
  const outcome: UpdateOutcome = { updated: 0, unchanged: 0, held: 0, failed: 0, manual: 0, interrupted: false };

  // The running child gets Ctrl+C too and cleans up after itself; we just
  // stop before the next tool instead of exiting mid-install.
  const onInterrupt = () => {
    outcome.interrupted = true;
  };
  process.on("SIGINT", onInterrupt);

  try {
    for (const { scan, tool, instance } of targets) {
      if (outcome.interrupted) break;
      const plan = scan.plan;
      if (!plan) continue;

      if (plan.kind === "manual") {
        outcome.manual++;
        box(`${pc.cyan(plan.command)}\n\n${pc.dim(plan.reason)}`, ` ${scan.name} — run this yourself `);
        continue;
      }

      const [command, ...args] = plan.command;
      if (!command) continue;
      log.step(`Updating ${pc.bold(scan.name)}  ${pc.dim(`$ ${displayCommand(plan.command)}`)}`);
      const result = await execTee(command, args);

      if (result.code !== 0) {
        outcome.failed++;
        log.error(`${scan.name} update failed${result.code === null ? "" : ` (exit code ${result.code})`}`);
        const hint = await diagnose(result.output, scan.name, plan.command);
        if (hint) log.info(pc.yellow(hint));
        continue;
      }
      // The command ran: whatever we cached about this tool is stale now.
      cache?.dropTool(tool.id);

      // Re-check the copy that actually runs: catches shadowing and PATH caching.
      const before = scan.installedVersion;
      const after = await tool.getInstalledVersion(instance).catch(() => null);
      if (after && !sameVersion(before, after)) {
        outcome.updated++;
        log.success(`${scan.name} ${pc.dim(before ?? "?")} ${icons.arrow} ${pc.green(after)}`);
        continue;
      }
      const explained = tool.explainUnchanged?.(instance) ?? null;
      if (explained) {
        outcome.held++;
        log.warn(explained.message);
      } else {
        outcome.unchanged++;
        log.warn(
          `${scan.name}: the update command succeeded but the running copy still reports ${after ?? "an unknown version"}. ` +
            "Another install may be shadowing it, or a new terminal is needed.",
        );
      }
    }
  } finally {
    process.off("SIGINT", onInterrupt);
    cache?.save();
  }

  if (outcome.interrupted) log.warn("Interrupted — remaining updates were skipped.");
  return outcome;
}
