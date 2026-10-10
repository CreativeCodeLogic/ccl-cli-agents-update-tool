import { log } from "@clack/prompts";
import pc from "picocolors";
import type { InstallMethod, ToolScan } from "../types";
import { displayDir } from "../utils/paths";

function describe(method: InstallMethod | null, npmPackage: string | undefined): string {
  return method === "npm" && npmPackage ? `npm ${npmPackage}` : (method ?? "unknown");
}

/**
 * One compact warning per tool with copies hidden behind an earlier PATH entry, e.g.
 * "kimi: running native 0.28.1 (~/.kimi-code/bin); npm @moonshot-ai/kimi-code 2.1.1
 *  (~/AppData/Roaming/npm) is installed but never runs (shadowed on PATH)."
 */
export function printShadowedWarnings(
  results: readonly ToolScan[],
  npmPackages: ReadonlyMap<string, string | undefined>,
): void {
  for (const r of results) {
    if (r.shadowed.length === 0 || !r.binaryPath) continue;
    const pkg = npmPackages.get(r.id);
    const running = `running ${describe(r.installMethod, pkg)} ${r.installedVersion ?? "?"} (${displayDir(r.binaryPath)})`;
    const hidden = r.shadowed
      .map((s) => `${describe(s.installMethod, pkg)} ${s.version ?? "?"} (${displayDir(s.path)})`)
      .join(", ");
    const verb = r.shadowed.length === 1 ? "is installed but never runs" : "are installed but never run";
    log.warn(`${pc.bold(r.id)}: ${running}; ${hidden} ${verb} ${pc.dim("(shadowed on PATH)")}.`);
  }
}
