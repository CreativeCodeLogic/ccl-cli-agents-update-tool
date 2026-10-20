import pkg from "../../package.json" with { type: "json" };
import { registry } from "../registry";
import { LatestResolver } from "../scan";
import type { ProcessInfo } from "../processes";
import type { ProjectManifest } from "../project";
import type { InstallContext } from "../self";
import type { SelectionStore, ToolChoice } from "../selection";
import type { BinaryInstance, ToolDescriptor, ToolGroup } from "../types";
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
/** As if the user decided on Cursor last time: shows the "Selection remembered" hint. */
const DEMO_CHOICES: Record<string, ToolChoice> = { cursor: "skip" };
const NPM_GLOBAL = { prefix: "/usr/local", root: "/usr/local/lib/node_modules" };
const UV_TOOLS = `${HOME}/.local/share/uv/tools`;
/** Text files the Python detector reads (uv's environment for Aider). */
const TEXTS: Record<string, string> = {
  [`${UV_TOOLS}/aider-chat/lib/python3.12/site-packages/aider_chat-0.86.1.dist-info/METADATA`]: "Metadata-Version: 2.1\nName: aider-chat\nVersion: 0.86.1\n",
  [`${HOME}/projects/shop/node_modules/wrangler/package.json`]: JSON.stringify({ name: "wrangler", version: "4.148.0" }),
};
/** The project in the "current folder": it pins its own Wrangler. */
export const DEMO_PROJECT: ProjectManifest = {
  file: `${HOME}/projects/shop/package.json`,
  dir: `${HOME}/projects/shop`,
  deps: new Map([["wrangler", { range: "^4.149.0", field: "devDependencies" }]]),
};

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
 * A 1.1 tour, in two groups: up-to-date tools, updates (npm, a uv tool, a native
 * self-updater), a self-updating tool (Cursor), a retired one (Gemini), a hidden
 * copy (Kimi), a manual apt plan (gcloud), Wrangler's vendor note plus a project
 * that pins Wrangler, and tools that are not installed (only installed ones show).
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
  antigravity: { latest: "1.3.3", binaries: [] },
  qwen: { latest: "0.25.0", binaries: [] },
  kimi: {
    latest: "2.1.1",
    binaries: [
      { path: `${HOME}/.kimi-code/bin/kimi`, version: "2.0.4" },
      { path: "/usr/local/bin/kimi", target: "/usr/local/lib/node_modules/@moonshot-ai/kimi-code/dist/main.mjs", version: "2.1.1" },
    ],
  },
  aider: {
    latest: "0.86.2",
    binaries: [{ path: `${HOME}/.local/bin/aider`, target: `${UV_TOOLS}/aider-chat/bin/aider`, version: "0.86.1" }],
  },
  firebase: { latest: "15.33.0", binaries: [] },
  wrangler: { latest: "4.149.0", binaries: [{ path: "/usr/local/bin/wrangler", target: "/usr/local/lib/node_modules/wrangler/bin/wrangler.js", version: "4.149.0" }] },
  netlify: { latest: "27.12.0", binaries: [{ path: "/usr/local/bin/netlify", target: "/usr/local/lib/node_modules/netlify-cli/bin/run.js", version: "27.11.0" }] },
  gcloud: { latest: "588.0.0", binaries: [{ path: "/usr/bin/gcloud", target: "/usr/lib/google-cloud-sdk/bin/gcloud", version: "587.0.0" }] },
  npm: { latest: "12.2.0", binaries: [{ path: "/usr/local/bin/npm", target: "/usr/local/lib/node_modules/npm/bin/npm-cli.js", version: "12.2.0" }] },
};

/** Fake terminal output for each simulated update, by tool. */
const UPDATE_OUTPUT: Record<string, string[]> = {
  codex: [
    ...Array.from({ length: 9 }, (_, i) => `npm http fetch GET 200 https://registry.npmjs.org/@openai%2fcodex-linux-x64/-/codex-0.162.1-part${i + 1}.tgz ${120 + i * 9}ms`),
    "changed 2 packages in 3s",
  ],
  gemini: ["resolving @google/gemini-cli@0.63.0", "changed 138 packages in 3s"],
  kimi: ["Checking for updates... 2.0.4 -> 2.1.1", "Downloading Kimi Code 2.1.1 (linux-x64)... done", "Installed Kimi Code 2.1.1"],
  antigravity: ["Checking for updates... 1.3.1 -> 1.3.3", "Downloading agy 1.3.3 (linux_amd64)... done", "agy is now 1.3.3"],
  aider: ["Resolved 92 packages in 412ms", "Updated aider-chat v0.86.1 -> v0.86.2", "Installed 1 executable: aider"],
  netlify: [
    ...Array.from({ length: 6 }, (_, i) => `npm http fetch GET 200 https://registry.npmjs.org/netlify-cli/-/netlify-cli-27.12.0-part${i + 1}.tgz ${90 + i * 11}ms`),
    "changed 31 packages in 2s",
  ],
  cursor: ["Checking for updates...", "Cursor Agent is up to date (2026.10.01-e373342)"],
  claude: ["Checking for updates...", "Claude Code is up to date"],
};
function demoHost(): Host {
  // uv on PATH, so Aider's uv plan runs automatically.
  const files = new Set<string>(["/usr/local/bin/node", `${HOME}/.local/bin/uv`, ...Object.keys(TEXTS)]);
  const links = new Map<string, string>();
  for (const tool of Object.values(FIXTURE)) {
    for (const bin of tool.binaries) {
      files.add(bin.path);
      if (bin.target) {
        links.set(bin.path, bin.target);
        files.add(bin.target);
      }
    }
  }
  const norm = (p: string) => normalizePath(p, "linux");
  const fs: FsProbe = {
    exists: (p) => [...files].some((f) => f === norm(p) || f.startsWith(`${norm(p)}/`)),
    isExecutable: (p) => files.has(norm(p)),
    realpath: (p) => links.get(norm(p)) ?? p,
    // The user owns their home and the npm prefix; /usr/bin and /usr/lib belong to root.
    isWritable: (p) => [HOME, "/usr/local"].some((root) => norm(p) === root || norm(p).startsWith(`${root}/`)),
    readText: (p) => TEXTS[norm(p)] ?? null,
    mtimeMs: () => null,
    list: (dir) => {
      const prefix = `${norm(dir)}/`;
      return [...new Set([...files].filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length).split("/")[0]!))];
    },
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
  /** The demo never reads the current folder; it uses DEMO_PROJECT instead. */
  cwd: null;
  projectFixture: ProjectManifest;
  host: Host;
  latest: LatestResolver;
  selections: SelectionStore;
  executor: UpdateExecutor;
  freshLatest: () => LatestResolver;
  elevated: Promise<boolean>;
  /** Codex "running" for the pre-flight check; no real processes are listed. */
  listProcesses: () => Promise<ProcessInfo[]>;
  /** Shows the "newer ccl-caut" notice under the banner without any network. */
  selfFixture: { latest: string; context: InstallContext };
}

/** Remembered selections for the demo: in memory only, never the user's config file. */
function memorySelections(initial: Record<string, ToolChoice>): SelectionStore {
  let choices = { ...initial };
  let hidden: ToolGroup[] = [];
  // The demo starts as if the star line was already shown for this version (keeps the GIF's ending clean).
  let starShown: string | null = pkg.version;
  // In memory only: every demo run starts with the --discover hint.
  let discoverUsed = false;
  return {
    get discoverUsed() {
      return discoverUsed;
    },
    markDiscoverUsed: () => {
      discoverUsed = true;
    },
    get starShownVersion() {
      return starShown;
    },
    markStarShown: (version) => {
      starShown = version;
    },
    get toolChoices() {
      return choices;
    },
    get hiddenGroups() {
      return hidden;
    },
    setGroupHidden: (group, isHidden) => {
      hidden = isHidden ? [...new Set([...hidden, group])] : hidden.filter((g) => g !== group);
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

  /** Current fixture version per binary path; updates bump the copy that runs. */
  const versions = new Map<string, string>();
  for (const tool of Object.values(FIXTURE)) for (const bin of tool.binaries) versions.set(bin.path, bin.version);

  const tools = registry.map((real, index): ToolDescriptor => {
    const fixture = FIXTURE[real.id] ?? { latest: "1.0.0", binaries: [] };
    // Staggered like real lookups (0.3-1.9s), so the live table fills in row by row.
    const latency = 300 + ((index * 367) % 1_600);
    return {
      ...real,
      getInstalledVersion: async (instance: BinaryInstance) => versions.get(instance.path) ?? null,
      getLatestVersion: async () => {
        await sleep(latency);
        return fixture.latest;
      },
      // No PyPI lookups in the demo.
      checkCompatibility: async () => null,
    };
  });

  const executor: UpdateExecutor = async (_command, _args, target, onChunk) => {
    const lines = UPDATE_OUTPUT[target.scan.id] ?? ["updating..."];
    for (const line of lines) {
      await sleep(Math.round(1_500 / lines.length));
      onChunk(`${line}\n`);
    }
    const latest = FIXTURE[target.scan.id]?.latest;
    if (latest) versions.set(target.instance.path, latest);
    return { code: 0, output: lines.join("\n") };
  };

  return {
    tools,
    host,
    latest: new LatestResolver(null),
    freshLatest: () => new LatestResolver(null),
    elevated: Promise.resolve(false),
    listProcesses: async () => [{ pid: 4242, commandLine: "node /usr/local/lib/node_modules/@openai/codex/bin/codex.js" }],
    cwd: null,
    projectFixture: DEMO_PROJECT,
    selections: memorySelections(DEMO_CHOICES),
    executor,
    selfFixture: { latest: "1.0.1", context: "global" },
  };
}