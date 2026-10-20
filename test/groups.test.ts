import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registry } from "../src/registry";
import type { Detection } from "../src/scan";
import type { ToolScan } from "../src/types";
import { renderDiscovery } from "../src/ui/discover";
import { checklist } from "../src/ui/prompts";
import { icons } from "../src/ui/symbols";
import { printNotes, renderTable } from "../src/ui/table";

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
const strip = (s: string) => s.replace(ANSI, "");

const row = (id: string, group: ToolScan["group"], overrides: Partial<ToolScan> = {}): ToolScan => ({
  id, name: id, shortName: id, group, docsUrl: "", installed: true, installMethod: "npm", binaryPath: `/bin/${id}`,
  installedVersion: "1.0.0", latestVersion: "1.0.0", latestStaleCachedAt: null, state: "up-to-date", updateAvailable: false,
  needsAdmin: false, plan: null, shadowed: [], deprecation: null, notes: [], projectPin: null, compatibility: null, ...overrides,
});

describe("tool groups", () => {
  it("assigns the cloud, hosting and package-manager CLIs to Dev CLIs and the rest to AI agents", () => {
    const dev = registry.filter((t) => t.group === "dev").map((t) => t.id);
    expect(dev).toEqual(["firebase", "gcloud", "npm", "wrangler", "vercel", "netlify", "supabase", "gh"]);
    expect(registry.filter((t) => t.group === "agents").map((t) => t.id)).toEqual([
      "claude", "codex", "copilot", "cursor", "opencode", "gemini", "antigravity", "qwen", "kimi", "aider", "vibe", "cline", "amp", "kiro", "goose",
    ]);
  });

  it("puts a dim heading above each group, agents first, order kept inside a group", () => {
    const lines = strip(renderTable([row("npm", "dev"), row("claude", "agents"), row("firebase", "dev"), row("codex", "agents")])).split("\n");
    const names = lines.slice(2).map((l) => l.trim().split(/\s+/).slice(0, 2).join(" "));
    // The glyph comes from the symbol module, so the test passes in any terminal (conhost uses fallbacks).
    const ok = icons.ok;
    expect(names).toEqual(["AI agents", `${ok} claude`, `${ok} codex`, "Dev CLIs", `${ok} npm`, `${ok} firebase`]);
  });

  it("leaves out empty groups (and not-installed rows)", () => {
    const text = strip(renderTable([row("claude", "agents"), row("npm", "dev", { installed: false })]));
    expect(text).toContain("AI agents");
    expect(text).not.toContain("Dev CLIs");
  });

  it("--discover lists every group and marks hidden ones", () => {
    const detections = registry.map((tool) => ({ tool, instances: [] })) as Detection[];
    const text = strip(renderDiscovery(detections, ["dev"]));
    expect(text).toContain("  AI agents\n");
    expect(text).toContain("  Dev CLIs (hidden · --show-group dev)");
    expect(text.indexOf("Dev CLIs")).toBeGreaterThan(text.indexOf("Qwen Code"));
  });

  it("shows group headings in the checklist without making them selectable", async () => {
    const input = new PassThrough();
    let screen = "";
    const output = new Writable({ write: (chunk, _e, cb) => ((screen += String(chunk)), cb()) });
    setTimeout(() => input.write("\r"), 30);
    const picked = await checklist({
      message: "Select",
      options: [
        { value: "codex", label: "Codex CLI", group: "AI agents" },
        { value: "firebase", label: "Firebase CLI", group: "Dev CLIs" },
      ],
      initialValues: ["codex", "firebase"],
      input,
      output,
    });
    expect(picked).toEqual(["codex", "firebase"]);
    const text = strip(screen);
    expect(text).toContain("AI agents");
    expect(text.indexOf("Dev CLIs")).toBeGreaterThan(text.indexOf("Codex CLI"));
  });
});

describe("info notes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("print after the table with a dim cyan i, and never change the row", () => {
    let out = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => ((out += String(chunk)), true));
    const r = row("wrangler", "dev", { state: "outdated", notes: [{ kind: "info", message: "Cloudflare recommends installing Wrangler per project.", url: "https://example.test/w" }] });
    printNotes([r, row("ghost", "dev", { installed: false, notes: [{ kind: "info", message: "never shown" }] })], "linux");
    const text = strip(out);
    expect(text).toMatch(/i\s+wrangler: Cloudflare recommends installing Wrangler per project\./);
    expect(text).toContain("https://example.test/w");
    expect(text).not.toContain("never shown");
    expect(r.state).toBe("outdated");
  });
});