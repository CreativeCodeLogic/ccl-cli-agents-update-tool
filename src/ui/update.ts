import path from "node:path";
import { box, log } from "@clack/prompts";
import pc from "picocolors";
import type { BinaryInstance, ToolDescriptor, ToolScan } from "../types";
import { execInteractive } from "../utils/exec";
import { icons } from "./symbols";

/** A selected tool plus what we need to update and re-check the copy that runs. */
export interface UpdateTarget {
  scan: ToolScan;
  tool: ToolDescriptor;
  instance: BinaryInstance;
}

export interface UpdateOutcome {
  updated: number;
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

/** Run (auto) or print (manual) the plan for each selected tool, sequentially. */
export async function applyUpdates(targets: readonly UpdateTarget[]): Promise<UpdateOutcome> {
  const outcome: UpdateOutcome = { updated: 0, failed: 0, manual: 0, interrupted: false };

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
      const code = await execInteractive(command, args);

      if (code === 0) {
        outcome.updated++;
        const now = await tool.getInstalledVersion(instance).catch(() => null);
        const version = now ?? scan.latestVersion ?? "latest";
        log.success(`${scan.name} ${pc.dim(scan.installedVersion ?? "?")} ${icons.arrow} ${pc.green(version)}`);
      } else {
        outcome.failed++;
        log.error(`${scan.name} update failed${code === null ? "" : ` (exit code ${code})`}`);
      }
    }
  } finally {
    process.off("SIGINT", onInterrupt);
  }

  if (outcome.interrupted) log.warn("Interrupted — remaining updates were skipped.");
  return outcome;
}
