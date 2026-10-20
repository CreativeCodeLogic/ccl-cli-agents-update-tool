import type { ToolGroup, ToolScan } from "./types";

/** Remembered per-tool choice from the last confirmed checklist. */
export type ToolChoice = "update" | "skip";
export type ToolChoices = Readonly<Record<string, ToolChoice>>;

/** Where remembered choices live (user config file; in memory for --demo). */
export interface SelectionStore {
  readonly toolChoices: ToolChoices;
  saveChoices(choices: Record<string, ToolChoice>): void;
  reset(): void;
  /** Groups hidden with --hide-group. */
  readonly hiddenGroups: readonly ToolGroup[];
  setGroupHidden(group: ToolGroup, hidden: boolean): void;
  /** Once per version: the last version that showed the "Star it on GitHub" line. */
  readonly starShownVersion: string | null;
  markStarShown(version: string): void;
  /** Whether --discover has been run (hides the scan line's --discover hint). */
  readonly discoverUsed: boolean;
  markDiscoverUsed(): void;
}

/**
 * Offered in the checklist: an installed tool with a plan and something to do:
 * a newer version, a retired tool that is behind (opt-in), or a self-updater's
 * own update command.
 */
export function isOffered(r: ToolScan): boolean {
  if (!r.installed || !r.plan) return false;
  return r.state === "outdated" || r.state === "self-updating" || (r.state === "retired" && r.updateAvailable);
}

/** Pick for an offered tool the user has never decided on. */
export function selectedByDefault(r: ToolScan): boolean {
  return r.deprecation === null && r.state !== "self-updating";
}

export interface InitialSelection {
  ids: string[];
  /** At least one offered tool's pick came from a remembered choice. */
  remembered: boolean;
}

/** Preselect "update" choices, plus undecided tools that are selected by default; "skip" stays unticked. */
export function initialSelection(offered: readonly ToolScan[], choices: ToolChoices): InitialSelection {
  const ids = offered
    .filter((r) => {
      const choice = choices[r.id];
      return choice === "update" || (choice === undefined && selectedByDefault(r));
    })
    .map((r) => r.id);
  return { ids, remembered: offered.some((r) => choices[r.id] !== undefined) };
}

/** After a confirmed checklist: ticked -> "update", offered but unticked -> "skip"; others keep their entry. */
export function recordSelection(
  choices: ToolChoices,
  offered: readonly ToolScan[],
  picked: readonly string[],
): Record<string, ToolChoice> {
  const next: Record<string, ToolChoice> = { ...choices };
  for (const r of offered) next[r.id] = picked.includes(r.id) ? "update" : "skip";
  return next;
}