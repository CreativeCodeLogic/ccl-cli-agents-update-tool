import { log } from "@clack/prompts";
import { stripVTControlCharacters } from "node:util";
import pc from "picocolors";
import type { InstallMethod, ToolScan } from "../types";
import { icons, stateStyle } from "./symbols";

const visibleLength = (s: string) => stripVTControlCharacters(s).length;
const pad = (s: string, width: number) => s + " ".repeat(Math.max(0, width - visibleLength(s)));

/**
 * Render scan results as aligned columns: icon | tool | installed | latest | state | via.
 * Not-installed tools are left out unless `showAll` (see notInstalledLine()).
 */
export function renderTable(results: readonly ToolScan[], showAll = false): string {
  const visible = showAll ? results : results.filter((r) => r.installed);
  const header = ["", "Tool", "Installed", "Latest", "State", "Via"].map((h) => pc.bold(h));
  const rows = visible.map((r) => {
    const style = stateStyle[r.state];
    const retired = r.state === "retired";
    return [
      style.icon,
      !r.installed || retired ? pc.dim(r.name) : r.name,
      r.installedVersion ?? pc.dim(r.installed ? "?" : "—"),
      r.latestVersion ?? pc.dim("—"),
      style.label,
      pc.dim(`${r.installMethod ?? ""}${r.shadowed.length > 0 ? ` +${r.shadowed.length} hidden` : ""}`),
    ];
  });

  const all = [header, ...rows];
  const widths = header.map((_, col) => Math.max(...all.map((row) => visibleLength(row[col] ?? ""))));
  const line = (row: string[]) =>
    "  " + row.map((cell, col) => (col === row.length - 1 ? cell : pad(cell, widths[col] ?? 0))).join("  ");

  const rule = "  " + pc.dim(icons.rule.repeat(widths.reduce((sum, w) => sum + w, 0) + 2 * (widths.length - 1)));
  return [line(header), rule, ...rows.map(line)].join("\n");
}

/** "5 not installed: Copilot, OpenCode, ... · --show-all to list", or null when nothing is hidden. */
export function notInstalledLine(results: readonly ToolScan[], showAll = false): string | null {
  const missing = results.filter((r) => !r.installed);
  if (showAll || missing.length === 0) return null;
  return `${missing.length} not installed: ${missing.map((r) => r.shortName).join(", ")} · --show-all to list`;
}

function describe(method: InstallMethod | null, version: string | null): string {
  return `${method ?? "unknown"} ${version ?? "?"}`;
}

/** Notes printed after the table: hidden rows, deprecations, then copies shadowed on PATH. */
export function printNotes(results: readonly ToolScan[], showAll = false): void {
  const hidden = notInstalledLine(results, showAll);
  if (hidden) log.message(pc.dim(hidden));

  for (const r of results) {
    if (r.installed && r.deprecation) log.warn(`${pc.bold(r.id)}: ${r.deprecation.message}`);
  }
  // e.g. "kimi: native 2.0.4 runs; npm 2.1.1 is installed but shadowed on PATH"
  for (const r of results) {
    if (r.shadowed.length === 0) continue;
    const others = r.shadowed.map((s) => describe(s.installMethod, s.version)).join(" and ");
    const verb = r.shadowed.length === 1 ? "is" : "are";
    log.warn(`${pc.bold(r.id)}: ${describe(r.installMethod, r.installedVersion)} runs; ${others} ${verb} installed but shadowed on PATH`);
  }
}