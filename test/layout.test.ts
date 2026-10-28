import { describe, expect, it } from "vitest";
import { registry } from "../src/registry";
import type { ToolScan, ToolState } from "../src/types";
import { renderTable } from "../src/ui/table";

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
const strip = (s: string) => s.replace(ANSI, "");

/** Every supported tool installed, with the longest realistic values (worst case for width). */
export function manyToolsFixture(): ToolScan[] {
  const versions: Record<string, [string, string, ToolState]> = {
    claude: ["2.1.296", "2.1.296", "up-to-date"],
    codex: ["0.161.0", "0.162.1", "outdated"],
    copilot: ["1.0.12", "1.0.14", "outdated"],
    cursor: ["2026.10.01-e373342", "", "self-updating"],
    opencode: ["2.0.25", "2.0.26", "outdated"],
    gemini: ["0.62.1", "0.63.0", "retired"],
    antigravity: ["1.3.1", "1.3.3", "outdated"],
    qwen: ["0.9.2", "0.9.2", "up-to-date"],
    kimi: ["2.0.4", "2.1.1", "outdated"],
    aider: ["0.86.1", "0.86.2", "outdated"],
    vibe: ["2.26.1", "2.26.1", "up-to-date"],
    cline: ["3.0.68", "3.0.70", "outdated"],
    amp: ["0.0.1791634437-g1a2b3c", "0.0.1791734437-g42649e", "outdated"],
    kiro: ["2.29.0", "2.29.1", "outdated"],
    goose: ["1.53.0", "1.54.0", "outdated"],
    firebase: ["15.32.1", "15.33.0", "outdated"],
    gcloud: ["587.0.0", "588.0.0", "outdated"],
    npm: ["12.2.0", "12.2.0", "up-to-date"],
    wrangler: ["4.148.0", "4.149.0", "outdated"],
    vercel: ["63.1.2", "63.1.2", "up-to-date"],
    netlify: ["27.11.0", "27.12.0", "outdated"],
    supabase: ["2.118.0", "2.120.0", "outdated"],
    gh: ["2.100.0", "2.102.0", "outdated"],
  };
  const nineHoursAgo = new Date(Date.now() - 9 * 3600_000 - 60_000).toISOString();
  return registry.map((tool) => {
    const [installed, latest, state] = versions[tool.id]!;
    return {
      id: tool.id, name: tool.name, shortName: tool.shortName ?? tool.name, group: tool.group, docsUrl: tool.docsUrl,
      installed: true, installMethod: tool.id === "kimi" || tool.id === "kiro" || tool.id === "amp" ? "native" : tool.id === "aider" ? "uv" : "npm",
      binaryPath: `/bin/${tool.id}`, installedVersion: installed, latestVersion: latest || null,
      latestStaleCachedAt: tool.id === "amp" || tool.id === "gcloud" ? nineHoursAgo : null,
      state, updateAvailable: state === "outdated", needsAdmin: tool.id === "gcloud" || tool.id === "gh",
      plan: null, shadowed: tool.id === "kimi" || tool.id === "gh" ? [{ path: "/x", installMethod: "npm", version: "1.0.0" }] : [],
      deprecation: null, notes: [], projectPin: null, compatibility: null, waitingFor: null, broken: null,
    };
  });
}

const widest = (text: string) => Math.max(...strip(text).split("\n").map((l) => l.length));

describe("table layout with 23 tools", () => {
  it("fits 120 and 80 columns by compacting, never by dropping information", async () => {
    const rows = manyToolsFixture();
    const wide = renderTable(rows);
    const at120 = renderTable(rows, 120);
    const at80 = renderTable(rows, 80);
    if (process.env.CCL_CAUT_PRINT_LAYOUT) (await import("node:fs")).writeFileSync(process.env.CCL_CAUT_PRINT_LAYOUT, `--- full (${widest(wide)} cols)\n${strip(wide)}\n--- 120\n${strip(at120)}\n--- 80 (${widest(at80)} cols)\n${strip(at80)}`);
    expect(widest(at120)).toBeLessThanOrEqual(120);
    expect(widest(at80)).toBeLessThanOrEqual(80);
    // Every tool is still there, with both versions and its group heading.
    for (const r of rows) expect(strip(at80)).toContain(r.installedVersion!.split("-g")[0]!.slice(0, 10));
    expect(strip(at80)).toContain("AI agents");
    expect(strip(at80)).toContain("Dev CLIs");
    expect(strip(at80)).toMatch(/\* cached result \(couldn't check live; oldest 9h ago\)/);
    // A narrow table is only used when needed.
    expect(renderTable(rows, 1000)).toBe(wide);
  });

  it("shortens Amp's git-describe versions like other build suffixes", () => {
    expect(strip(renderTable(manyToolsFixture()))).toContain("0.0.1791734437 ");
  });
});