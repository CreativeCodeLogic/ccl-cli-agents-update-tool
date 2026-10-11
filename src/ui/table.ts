import { log } from "@clack/prompts";
import { stripVTControlCharacters } from "node:util";
import pc from "picocolors";
import { GROUP_LABELS, TOOL_GROUPS, type InstallMethod, type ToolNote, type ToolScan } from "../types";
import { displayVersion, formatAgo } from "./format";
import { icons, stateStyle } from "./symbols";
import { tone } from "./theme";

const visibleLength = (s: string) => stripVTControlCharacters(s).length;
const pad = (s: string, width: number) => s + " ".repeat(Math.max(0, width - visibleLength(s)));

/** Results in group order (AI agents, then Dev CLIs), registry order inside each group. */
export function byGroup<T extends { group: ToolScan["group"] }>(items: readonly T[]): T[] {
  return TOOL_GROUPS.flatMap((group) => items.filter((item) => item.group === group));
}

/**
 * Render scan results as aligned columns: icon | tool | installed | latest | state | via,
 * under a dim heading per group (empty groups are left out).
 * Installed tools only; `--discover` lists the rest.
 */
export function renderTable(results: readonly ToolScan[]): string {
  const visible = byGroup(results.filter((r) => r.installed));
  const header = ["", "Tool", "Installed", "Latest", "State", "Via"].map((h) => pc.bold(h));
  const rows = visible.map((r) => {
    const style = stateStyle[r.state];
    const retired = r.state === "retired";
    return [
      style.icon,
      !r.installed || retired ? pc.dim(r.name) : r.name,
      r.installedVersion ? displayVersion(r.installedVersion) : pc.dim(r.installed ? "?" : "—"),
      (r.latestVersion ? displayVersion(r.latestVersion) : pc.dim("—")) +
        (r.latestStaleCachedAt ? ` ${tone.muted(`cached ${formatAgo(r.latestStaleCachedAt)} ago`)}` : ""),
      style.label,
      tone.muted(`${r.installMethod ?? ""}${r.shadowed.length > 0 ? ` +${r.shadowed.length} hidden` : ""}`) +
        (r.needsAdmin ? ` ${tone.action("needs admin")}` : ""),
    ];
  });

  const all = [header, ...rows];
  const widths = header.map((_, col) => Math.max(...all.map((row) => visibleLength(row[col] ?? ""))));
  const line = (row: string[]) =>
    "  " + row.map((cell, col) => (col === row.length - 1 ? cell : pad(cell, widths[col] ?? 0))).join("  ");

  const rule = "  " + pc.dim(icons.rule.repeat(widths.reduce((sum, w) => sum + w, 0) + 2 * (widths.length - 1)));
  const body: string[] = [];
  visible.forEach((r, i) => {
    if (i === 0 || visible[i - 1]!.group !== r.group) body.push(`  ${tone.muted(GROUP_LABELS[r.group])}`);
    body.push(line(rows[i]!));
  });
  return [line(header), rule, ...body].join("\n");
}

function describe(method: InstallMethod | null, version: string | null): string {
  return `${method ?? "unknown"} ${version ?? "?"}`;
}

/** Info notes (vendor advice, project pins): a dim cyan "i", never a warning. */
export function formatInfoNote(id: string, note: ToolNote): string {
  return `${pc.bold(id)}: ${note.message}${note.url ? `\n${tone.muted(note.url)}` : ""}`;
}

export const INFO_SYMBOL = pc.dim(pc.cyan("i"));

/** Notes printed after the table: deprecations, copies shadowed on PATH, info notes, then admin rights (once). */
export function printNotes(results: readonly ToolScan[], platform: NodeJS.Platform = process.platform): void {
  for (const r of results) {
    // One sentence per line keeps notes within ~100 columns.
    if (r.installed && r.deprecation) log.warn(`${pc.bold(r.id)}: ${r.deprecation.message.replace(". ", ".\n")}`);
  }
  // e.g. "kimi: native 2.0.4 runs; npm 2.1.1 is installed but shadowed on PATH"
  for (const r of results) {
    if (r.shadowed.length === 0) continue;
    const others = r.shadowed.map((s) => describe(s.installMethod, s.version)).join(" and ");
    const verb = r.shadowed.length === 1 ? "is" : "are";
    log.warn(`${pc.bold(r.id)}: ${describe(r.installMethod, r.installedVersion)} runs; ${others} ${verb} installed but shadowed on PATH`);
  }
  for (const r of results) {
    if (!r.installed) continue;
    for (const note of r.notes) log.message(formatInfoNote(r.id, note), { symbol: INFO_SYMBOL });
  }
  if (results.some((r) => r.installed && r.needsAdmin)) {
    const how = platform === "win32" ? "run ccl-caut from a terminal opened with Run as administrator" : "the command needs sudo";
    log.message(`${tone.action("needs admin")} ${tone.muted(`= ${how}`)}`);
  }
}