import { box, log } from "@clack/prompts";
import pc from "picocolors";
import type { ToolDescriptor, ToolScan } from "../types";
import { execInteractive } from "../utils/exec";
import { icons } from "./symbols";

export interface UpdateOutcome {
  updated: number;
  failed: number;
  manual: number;
  /** Ctrl+C was pressed during an update; remaining tools were skipped. */
  interrupted: boolean;
}

/** Run (auto) or print (manual) the plan for each selected tool, sequentially. */
export async function applyUpdates(
  selected: readonly ToolScan[],
  descriptors: ReadonlyMap<string, ToolDescriptor>,
): Promise<UpdateOutcome> {
  const outcome: UpdateOutcome = { updated: 0, failed: 0, manual: 0, interrupted: false };

  // The running child gets Ctrl+C too and cleans up after itself; we just
  // stop before the next tool instead of exiting mid-install.
  const onInterrupt = () => {
    outcome.interrupted = true;
  };
  process.on("SIGINT", onInterrupt);

  try {
    for (const tool of selected) {
      if (outcome.interrupted) break;
      const plan = tool.plan;
      if (!plan) continue;

      if (plan.kind === "manual") {
        outcome.manual++;
        box(`${pc.cyan(plan.command)}\n\n${pc.dim(plan.reason)}`, ` ${tool.name} — run this yourself `);
        continue;
      }

      const [command, ...args] = plan.command;
      if (!command) continue;
      log.step(`Updating ${pc.bold(tool.name)}  ${pc.dim(`$ ${plan.command.join(" ")}`)}`);
      const code = await execInteractive(command, args);

      if (code === 0) {
        outcome.updated++;
        const now = await descriptors.get(tool.id)?.getInstalledVersion().catch(() => null);
        const version = now ?? tool.latestVersion ?? "latest";
        log.success(`${tool.name} ${pc.dim(tool.installedVersion ?? "?")} ${icons.arrow} ${pc.green(version)}`);
      } else {
        outcome.failed++;
        log.error(`${tool.name} update failed${code === null ? "" : ` (exit code ${code})`}`);
      }
    }
  } finally {
    process.off("SIGINT", onInterrupt);
  }

  if (outcome.interrupted) log.warn("Interrupted — remaining updates were skipped.");
  return outcome;
}
