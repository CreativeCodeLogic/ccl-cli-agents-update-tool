import { stripVTControlCharacters } from "node:util";
import pc from "picocolors";
import type { Detection } from "../scan";
import { displayVersion } from "./format";
import { icons } from "./symbols";

const visibleLength = (s: string) => stripVTControlCharacters(s).length;
const pad = (s: string, width: number) => s + " ".repeat(Math.max(0, width - visibleLength(s)));

/**
 * --discover: every supported tool with a one-line description, whether it is
 * installed (and which version runs), and its official install docs. Purely
 * informational: ccl-caut never installs anything.
 */
export function renderDiscovery(detections: readonly Detection[]): string {
  const rows = detections.map(({ tool, instances }) => {
    const active = instances[0];
    return {
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
  return rows
    .map((r) => `  ${r.icon}  ${pad(r.name, nameWidth)}  ${pad(r.version, versionWidth)}  ${r.description}\n${indent}${pc.cyan(r.docsUrl)}`)
    .join("\n");
}