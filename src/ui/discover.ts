import { stripVTControlCharacters } from "node:util";
import pc from "./colors";
import type { Detection } from "../scan";
import { GROUP_LABELS, TOOL_GROUPS, type ToolGroup } from "../types";
import { tone } from "./theme";
import { displayVersion } from "./format";
import { icons } from "./symbols";

/** The scan line's pointer to --discover, until it has been run once. */
export function discoverHint(found: number, total: number, discoverUsed: boolean): string {
  return found < total && !discoverUsed ? " · ccl-caut --discover to see all" : "";
}

const visibleLength = (s: string) => stripVTControlCharacters(s).length;
const pad = (s: string, width: number) => s + " ".repeat(Math.max(0, width - visibleLength(s)));

/**
 * --discover: every supported tool with a one-line description, whether it is
 * installed (and which version runs), and its official install docs. Purely
 * informational: ccl-caut never installs anything.
 */
export function renderDiscovery(detections: readonly Detection[], hiddenGroups: readonly ToolGroup[] = []): string {
  // Every group is listed, hidden ones included (and marked).
  const ordered = TOOL_GROUPS.flatMap((group) => detections.filter((d) => d.tool.group === group));
  const rows = ordered.map(({ tool, instances }) => {
    const active = instances[0];
    return {
      group: tool.group,
      icon: active ? pc.green(icons.ok) : pc.dim(icons.missing),
      name: active ? tool.name : pc.dim(tool.name),
      version: active ? (active.version ? displayVersion(active.version) : "?") : pc.dim("not installed"),
      description: tool.description,
      docsUrl: tool.docsUrl,
    };
  });
  const nameWidth = Math.max(...rows.map((r) => visibleLength(r.name)));
  const versionWidth = Math.max(...rows.map((r) => visibleLength(r.version)));
  const indent = " ".repeat(2 + 1 + 2 + nameWidth + 2 + versionWidth + 2);
  const heading = (group: ToolGroup) =>
    `  ${tone.muted(GROUP_LABELS[group])}${hiddenGroups.includes(group) ? tone.muted(` (hidden · --show-group ${group})`) : ""}`;
  return rows
    .map((r, i) => {
      const head = i === 0 || rows[i - 1]!.group !== r.group ? `${heading(r.group)}\n` : "";
      return `${head}  ${r.icon}  ${pad(r.name, nameWidth)}  ${pad(r.version, versionWidth)}  ${r.description}\n${indent}${pc.cyan(r.docsUrl)}`;
    })
    .join("\n");
}