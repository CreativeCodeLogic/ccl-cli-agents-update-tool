import { registry } from "../registry";
import { LatestResolver } from "../scan";
import type { SelectionStore, ToolChoice } from "../selection";
import type { BinaryInstance, ToolDescriptor } from "../types";
import type { UpdateExecutor } from "../ui/update";
import type { FsProbe, Host } from "../utils/host";
import { setHost } from "../utils/host";
import { primeNpmGlobalPaths } from "../utils/npm";
import { normalizePath } from "../utils/paths";
import { blockSideEffects } from "../utils/sandbox";

/*
 * --demo: the full interactive UI against fixture data. Nothing real happens:
 * side effects are blocked process-wide (no spawn, network or cache writes),
 * detection runs against an in-memory Linux machine, versions come from the
 * fixture, and updates go through a fake executor that only prints.
 * The real descriptors still decide install methods and update plans.
 */

const HOME = "/home/dev";
/** As if the user unticked gcloud last time: shows the "Selection remembered" hint. */
const DEMO_CHOICES: Record<string, ToolChoice> = { gcloud: "skip" };
const NPM_GLOBAL = { prefix: "/usr/local", root: "/usr/local/lib/node_modules" };

interface FixtureBinary {
  path: string;
  /** Symlink target, if any. */
  target?: string;
  version: string;
}

interface FixtureTool {
  binaries: FixtureBinary[];
  /** null = no public latest version (self-updating tools). */
  latest: string | null;
}

/**
 * A v1.0 tour: up-to-date tools, updates, a self-updating tool (Cursor), a
 * retired one (Gemini), a hidden copy (Kimi), a remembered "skip" (gcloud, manual
 * apt plan) and four tools that are not installed.
 */
const FIXTURE: Record<string, FixtureTool> = {
  claude: { latest: "2.1.296", binaries: [{ path: `${HOME}/.local/bin/claude`, target: `${HOME}/.local/share/claude/versions/2.1.296`, version: "2.1.296" }] },
  codex: { latest: "0.162.1", binaries: [{ path: "/usr/local/bin/codex", target: "/usr/local/lib/node_modules/@openai/codex/bin/codex.js", version: "0.161.0" }] },
  copilot: { latest: "1.0.95", binaries: [] },
  cursor: {
    latest: null,
    binaries: [{ path: `${HOME}/.local/bin/agent`, target: `${HOME}/.local/share/cursor-agent/versions/2026.10.01-e373342/cursor-agent`, version: "2026.10.01-e373342" }],
  },
  opencode: { latest: "1.18.35", binaries: [] },
  gemini: { latest: "0.63.0", binaries: [{ path: "/usr/local/bin/gemini", target: "/usr/local/lib/node_modules/@google/gemini-cli/dist/index.js", version: "0.62.1" }] },
  antigravity: { latest: "1.3.3", binaries: [{ path: `${HOME}/.local/bin/agy`, version: "1.3.1" }] },
  qwen: { latest: "0.25.0", binaries: [] },
  kimi: {
    latest: "2.1.1",
    binaries: [
      { path: `${HOME}/.kimi-code/bin/kimi`, version: "2.0.4" },
      { path: "/usr/local/bin/kimi", target: "/usr/local/lib/node_modules/@moonshot-ai/kimi-code/dist/main.mjs", version: "2.1.1" },
    ],
  },
  firebase: { latest: "15.33.0", binaries: [] },
  gcloud: { latest: "588.0.0", binaries: [{ path: "/usr/bin/gcloud", target: "/usr/lib/google-cloud-sdk/bin/gcloud", version: "587.0.0" }] },
  npm: { latest: "12.2.0", binaries: [{ path: "/usr/local/bin/npm", target: "/usr/local/lib/node_modules/npm/bin/npm-cli.js", version: "12.2.0" }] },
};

/** Fake terminal output for each simulated update, by tool. */
const UPDATE_OUTPUT: Record<string, string[]> = {
  codex: ["resolving @openai/codex@0.162.1", "downloading codex-linux-x64 (31.4 MB)", "changed 2 packages in 2s"],
  gemini: ["resolving @google/gemini-cli@0.63.0", "changed 138 packages in 3s"],
  kimi: ["Checking for updates... 2.0.4 -> 2.1.1", "Downloading Kimi Code 2.1.1 (linux-x64)... done", "Installed Kimi Code 2.1.1"],
  antigravity: ["Checking for updates... 1.3.1 -> 1.3.3", "Downloading agy 1.3.3 (linux_amd64)... done", "agy is now 1.3.3"],
  cursor: ["Checking for updates...", "Cursor Agent is up to date (2026.10.01-e373342)"],
  claude: ["Checking for updates...", "Claude Code is up to date"],
};
function demoHost(): Host {
  const files = new Set<string>(["/usr/local/bin/node"]);
  const links = new Map<string, string>();
  for (const tool of Object.values(FIXTURE)) {
    for (const bin of tool.binaries) {
      files.add(bin.path);
      if (bin.target) links.set(bin.path, bin.target);
    }
  }
  const norm = (p: string) => normalizePath(p, "linux");
  const fs: FsProbe = {
    exists: (p) => [...files].some((f) => f === norm(p) || f.startsWith(`${norm(p)}/`)),
    isExecutable: (p) => files.has(norm(p)),
    realpath: (p) => links.get(norm(p)) ?? p,
    isWritable: () => false,
    readText: () => null,
    mtimeMs: () => null,
  };
  return {
    platform: "linux",
    homedir: HOME,
    env: { PATH: [`${HOME}/.local/bin`, `${HOME}/.kimi-code/bin`, "/usr/local/bin", "/usr/bin", "/bin"].join(":") },
    fs,
  };
}

export interface DemoOptions {
  /** Pause between fake output lines (tests pass a no-op). */
  sleep?: (ms: number) => Promise<void>;
  /** Where fake update output goes (defaults to stdout). */
  write?: (text: string) => void;
}

export interface DemoRuntime {
  tools: ToolDescriptor[];
  host: Host;
  latest: LatestResolver;
  selections: SelectionStore;
  executor: UpdateExecutor;
}

/** Remembered selections for the demo: in memory only, never the user's config file. */
function memorySelections(initial: Record<string, ToolChoice>): SelectionStore {
  let choices = { ...initial };
  return {
    get toolChoices() {
      return choices;
    },
    saveChoices: (next) => {
      choices = { ...next };
    },
    reset: () => {
      choices = {};
    },
  };
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createDemoRuntime(options: DemoOptions = {}): DemoRuntime {
  blockSideEffects("demo mode");
  const host = demoHost();
  setHost(host);
  primeNpmGlobalPaths(NPM_GLOBAL);

  const sleep = options.sleep ?? realSleep;
  const write = options.write ?? ((text: string) => void process.stdout.write(text));

  /** Current fixture version per binary path; updates bump the copy that runs. */
  const versions = new Map<string, string>();
  for (const tool of Object.values(FIXTURE)) for (const bin of tool.binaries) versions.set(bin.path, bin.version);

  const tools = registry.map((real): ToolDescriptor => {
    const fixture = FIXTURE[real.id] ?? { latest: "1.0.0", binaries: [] };
    return {
      ...real,
      getInstalledVersion: async (instance: BinaryInstance) => versions.get(instance.path) ?? null,
      getLatestVersion: async () => fixture.latest,
    };
  });

  const executor: UpdateExecutor = async (_command, _args, target) => {
    const lines = UPDATE_OUTPUT[target.scan.id] ?? ["updating..."];
    for (const line of lines) {
      await sleep(450);
      write(`${line}\n`);
    }
    const latest = FIXTURE[target.scan.id]?.latest;
    if (latest) versions.set(target.instance.path, latest);
    return { code: 0, output: lines.join("\n") };
  };

  return { tools, host, latest: new LatestResolver(null), selections: memorySelections(DEMO_CHOICES), executor };
}