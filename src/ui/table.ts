import { stripVTControlCharacters } from "node:util";
import pc from "picocolors";
import type { ToolScan } from "../types";
import { icons, stateStyle } from "./symbols";

const visibleLength = (s: string) => stripVTControlCharacters(s).length;
const pad = (s: string, width: number) => s + " ".repeat(Math.max(0, width - visibleLength(s)));

/** Render scan results as aligned columns: icon | tool | installed | latest | state | via. */
export function renderTable(results: readonly ToolScan[]): string {
  const header = ["", "Tool", "Installed", "Latest", "State", "Via"].map((h) => pc.bold(h));
  const rows = results.map((r) => {
    const style = stateStyle[r.state];
    return [
      style.icon,
      r.installed ? r.name : pc.dim(r.name),
      r.installedVersion ?? pc.dim(r.installed ? "?" : "—"),
      r.latestVersion ?? pc.dim("—"),
      style.label,
      pc.dim(r.installMethod ?? ""),
    ];
  });

  const all = [header, ...rows];
  const widths = header.map((_, col) => Math.max(...all.map((row) => visibleLength(row[col] ?? ""))));
  const line = (row: string[]) =>
    "  " + row.map((cell, col) => (col === row.length - 1 ? cell : pad(cell, widths[col] ?? 0))).join("  ");

  const rule = "  " + pc.dim(icons.rule.repeat(widths.reduce((sum, w) => sum + w, 0) + 2 * (widths.length - 1)));
  return [line(header), rule, ...rows.map(line)].join("\n");
}
