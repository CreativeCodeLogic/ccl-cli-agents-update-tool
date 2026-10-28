import path from "node:path";
import { initialSelection, isOffered, type ToolChoices } from "./selection";
import type { ToolGroup, ToolScan, UpdatePlan } from "./types";
import pc from "./ui/colors";
import { tone } from "./ui/theme";

/*
 * What the user still has to run themselves, repeated as the last lines of a
 * run (and by `ccl-caut --pending`): ticked tools whose plan is a command to
 * copy, plus automatic updates that failed or were skipped, with their command.
 *
 * Copy-safety: each command is a line of its own with no gutter, symbol, indent
 * or color, so a triple-click copies exactly the command. Its context sits on the
 * line above as a "#" comment: bash, zsh and PowerShell (where these commands
 * run) ignore it if both lines are pasted, and cmd.exe only prints a harmless
 * "'#' is not recognized" before running the next line.
 */

export type PendingShell = "powershell" | "sh" | "any";

export interface PendingItem {
  id: string;
  name: string;
  command: string;
  reason: string;
  needsAdmin: boolean;
  /** Where the command runs: PowerShell (irm | iex), a POSIX shell (sudo), or any shell. */
  shell: PendingShell;
  /** Why it is still pending beyond its plan, e.g. "update failed" or "was running". */
  status?: string;
}

/** The shell a command needs, from its syntax. */
export function shellOf(command: string): PendingShell {
  if (/(^|\s)(irm|iwr|iex)\s|\|\s*iex\b|^&\s/i.test(command)) return "powershell";
  if (/^sudo\s|\|\s*(ba|z)?sh\b/.test(command)) return "sh";
  return "any";
}

/** An automatic command as a line to type: executables by name (they are on PATH), quoted when needed. */
export function autoCommandLine(command: readonly string[]): string {
  const [bin = "", ...args] = command;
  const name = path.isAbsolute(bin) ? path.parse(bin).name : bin;
  return [name, ...args].map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(" ");
}

/** The pending item for a tool and its plan (a manual plan, or an automatic one that didn't apply). */
export function pendingItem(scan: Pick<ToolScan, "id" | "name" | "needsAdmin">, plan: UpdatePlan, status?: string): PendingItem {
  const command = plan.kind === "manual" ? plan.command.trim() : autoCommandLine(plan.command);
  const reason = plan.kind === "manual" ? plan.reason : (status ?? "the automatic update did not apply");
  const needsAdmin = scan.needsAdmin || (plan.kind === "manual" && Boolean(plan.needsAdmin)) || /^sudo\s/.test(command);
  return { id: scan.id, name: scan.name, command, reason, needsAdmin, shell: shellOf(command), ...(status && { status }) };
}

/**
 * Pending items for the tools selected in a run: manual plans, and automatic
 * updates that failed or were skipped (`automatic` maps id -> why). Waiting for
 * winget is not pending (nothing to run yet); up-to-date tools are never selected.
 */
export function collectPending(selected: readonly ToolScan[], automatic: ReadonlyMap<string, string> = new Map()): PendingItem[] {
  const items: PendingItem[] = [];
  for (const scan of selected) {
    if (!scan.plan || scan.waitingFor) continue;
    if (scan.plan.kind === "manual") items.push(pendingItem(scan, scan.plan));
    else if (automatic.has(scan.id)) items.push(pendingItem(scan, scan.plan, automatic.get(scan.id)));
  }
  return items;
}

/**
 * What --pending (and --json's `pending`) list without a run: the tools that
 * would be selected, whose update the user has to run (a manual plan), or that
 * --yes would skip because they need admin rights.
 */
export function pendingForSelection(selected: readonly ToolScan[]): PendingItem[] {
  const needsAdmin = new Map(selected.filter((s) => s.plan?.kind === "auto" && s.needsAdmin).map((s) => [s.id, "needs admin rights"]));
  return collectPending(selected, needsAdmin);
}

/**
 * --pending and --json: no run, no session state. The tools that would be
 * selected (remembered ticks, else the defaults) in the groups shown.
 * Once a command has been run, its tool is up to date and drops off.
 */
export function pendingForResults(results: readonly ToolScan[], choices: ToolChoices, groups: readonly ToolGroup[]): PendingItem[] {
  const offered = results.filter((r) => isOffered(r) && groups.includes(r.group));
  const initial = initialSelection(offered, choices);
  return withBroken(brokenPending(results.filter((r) => groups.includes(r.group))), pendingForSelection(offered.filter((r) => initial.ids.includes(r.id))));
}

/**
 * At the end of a run: the selected tools' manual commands, plus automatic
 * updates that failed or were skipped. Ctrl+C (interrupted): nothing.
 */
export function leftOverPending(
  selected: readonly ToolScan[],
  outcome: { interrupted: boolean; failedIds: readonly string[]; repairs?: ReadonlyMap<string, { command: string; reason: string }> },
  skippedWhy: ReadonlyMap<string, string> = new Map(),
): PendingItem[] {
  if (outcome.interrupted) return [];
  const leftOver = new Map(skippedWhy);
  for (const id of outcome.failedIds) leftOver.set(id, "update failed");
  // Broken by the update (npm skipped a needed install script): its repair command instead.
  const repaired = selected.map((scan) => {
    const repair = outcome.repairs?.get(scan.id);
    return repair ? { ...scan, plan: { kind: "manual" as const, ...repair } } : scan;
  });
  return collectPending(repaired, leftOver).map((item) => (outcome.repairs?.has(item.id) ? { ...item, status: "broken" } : item));
}

function context(item: PendingItem): string {
  const notes = [
    item.needsAdmin ? "admin terminal" : null,
    item.shell === "powershell" ? "PowerShell" : null,
    item.status ?? null,
  ].filter(Boolean);
  return `# ${item.name}${notes.length > 0 ? ` (${notes.join(", ")})` : ""}`;
}

/** The block, last thing printed. Commands are plain lines (never colored); empty list: nothing. */
export function renderPending(items: readonly PendingItem[]): string {
  if (items.length === 0) return "";
  // clack's closing line already ends with a blank line.
  const lines = [tone.action("Still to do, run these yourself:")];
  for (const item of items) lines.push("", pc.dim(context(item)), item.command);
  lines.push("", tone.muted("Run ccl-caut --pending anytime to see what's left."));
  return `${lines.join("\n")}\n`;
}
/** Tools whose npm-installed command doesn't run (scan time): their repair command, always listed. */
export function brokenPending(results: readonly ToolScan[]): PendingItem[] {
  return results
    .filter((r) => r.broken)
    .map((r) => ({ id: r.id, name: r.name, command: r.broken!.command, reason: r.broken!.reason, needsAdmin: r.needsAdmin, shell: shellOf(r.broken!.command), status: "broken" }));
}

/** Broken tools' repairs first, then the rest (a broken tool is listed once, with its repair). */
export function withBroken(broken: readonly PendingItem[], items: readonly PendingItem[]): PendingItem[] {
  const ids = new Set(broken.map((b) => b.id));
  return [...broken, ...items.filter((i) => !ids.has(i.id))];
}
