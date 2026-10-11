import { afterEach, describe, expect, it } from "vitest";
import { aider } from "../src/registry/aider";
import { amp } from "../src/registry/amp";
import { cline } from "../src/registry/cline";
import { gh } from "../src/registry/gh";
import { goose } from "../src/registry/goose";
import { kiro } from "../src/registry/kiro";
import { netlify } from "../src/registry/netlify";
import { supabase } from "../src/registry/supabase";
import { vercel } from "../src/registry/vercel";
import { vibe } from "../src/registry/vibe";
import { wrangler } from "../src/registry/wrangler";
import { computeNeedsAdmin } from "../src/scan";
import type { InstallMethod, ToolDescriptor, UpdatePlan } from "../src/types";
import { setHost, type Host } from "../src/utils/host";
import { classifyInstall } from "../src/utils/installMethod";
import { primeNpmGlobalPaths, type NpmGlobalPaths } from "../src/utils/npm";
import { fakeHost, instance, win } from "./helpers";

/*
 * Every new 1.1 tool on Linux, macOS and Windows: where its binary lives ->
 * install method (generic inference + the tool's refinement) -> update plan.
 */

const NL = String.fromCharCode(10);
const meta = (name: string, version: string) => `Metadata-Version: 2.1${NL}Name: ${name}${NL}Version: ${version}${NL}`;

let restore = () => {};
afterEach(() => restore());

interface Case {
  tool: ToolDescriptor;
  host: Host;
  npm: NpmGlobalPaths | null;
  bin: string;
  real?: string;
  method: InstallMethod;
  plan: Partial<UpdatePlan> & { command?: unknown };
}

async function check({ tool, host, npm, bin, real = bin, method, plan }: Case): Promise<void> {
  restore();
  restore = setHost(host);
  primeNpmGlobalPaths(npm);
  const generic = classifyInstall(bin, real, { host, npmGlobal: npm });
  const refined = tool.refineInstallMethod ? await tool.refineInstallMethod(generic, { path: bin, realPath: real }) : generic;
  expect(refined).toBe(method);
  expect(await tool.getUpdatePlan(instance(bin, refined, real))).toMatchObject(plan);
}

// ---- Linux ----
const lh = "/home/jane";
const linuxNpm = { prefix: "/usr/local", root: "/usr/local/lib/node_modules" };
const linux = (extra: Partial<Parameters<typeof fakeHost>[0]> = {}) => fakeHost({ platform: "linux", homedir: lh, ...extra });
const debian = () => linux({ texts: { "/etc/os-release": `ID=debian${NL}` } });
const fedora = () => linux({ texts: { "/etc/os-release": `ID=fedora${NL}ID_LIKE="rhel centos"${NL}` } });
const uvLinux = (pkg: string, exe: string, version: string) => {
  const venv = `${lh}/.local/share/uv/tools/${pkg}`;
  return linux({
    env: { PATH: `${lh}/.local/bin` },
    files: [`${lh}/.local/bin/uv`, `${venv}/bin/${exe}`],
    texts: { [`${venv}/lib/python3.12/site-packages/${pkg.replace(/-/g, "_")}-${version}.dist-info/METADATA`]: meta(pkg, version) },
  });
};

// ---- macOS (Homebrew on Apple silicon) ----
const mh = "/Users/jane";
const macNpm = { prefix: "/opt/homebrew", root: "/opt/homebrew/lib/node_modules" };
const mac = () => fakeHost({ platform: "darwin", homedir: mh });

// ---- Windows ----
const wh = win("C:/Users/Jane");
const appData = win(`${wh}/AppData/Roaming`);
const winNpm = { prefix: win(`${appData}/npm`), root: win(`${appData}/npm/node_modules`) };
const winEnv = { APPDATA: appData, LOCALAPPDATA: win(`${wh}/AppData/Local`), ProgramFiles: win("C:/Program Files"), "ProgramFiles(x86)": win("C:/Program Files (x86)") };
const windows = (extra: Partial<Parameters<typeof fakeHost>[0]> = {}) => fakeHost({ platform: "win32", homedir: wh, env: winEnv, ...extra });

const npmAuto = (pkg: string) => ({ kind: "auto" as const, command: ["npm", "install", "-g", `${pkg}@latest`] });

describe("Dev CLIs", () => {
  it.each<[string, Case]>([
    ["wrangler npm (Linux)", { tool: wrangler, host: linux(), npm: linuxNpm, bin: "/usr/local/bin/wrangler", real: "/usr/local/lib/node_modules/wrangler/bin/wrangler.js", method: "npm", plan: npmAuto("wrangler") }],
    ["wrangler npm (macOS, Homebrew's Node)", { tool: wrangler, host: mac(), npm: macNpm, bin: "/opt/homebrew/bin/wrangler", real: "/opt/homebrew/lib/node_modules/wrangler/bin/wrangler.js", method: "npm", plan: npmAuto("wrangler") }],
    ["wrangler npm (Windows shim)", { tool: wrangler, host: windows(), npm: winNpm, bin: win(`${appData}/npm/wrangler.cmd`), method: "npm", plan: npmAuto("wrangler") }],
    ["vercel npm (Linux)", { tool: vercel, host: linux(), npm: linuxNpm, bin: "/usr/local/bin/vercel", real: "/usr/local/lib/node_modules/vercel/dist/vc.js", method: "npm", plan: npmAuto("vercel") }],
    ["vercel npm (macOS)", { tool: vercel, host: mac(), npm: macNpm, bin: "/opt/homebrew/bin/vercel", real: "/opt/homebrew/lib/node_modules/vercel/dist/vc.js", method: "npm", plan: npmAuto("vercel") }],
    ["vercel npm (Windows)", { tool: vercel, host: windows(), npm: winNpm, bin: win(`${appData}/npm/vercel.cmd`), method: "npm", plan: npmAuto("vercel") }],
    ["netlify npm (Linux, nvm: another prefix)", { tool: netlify, host: linux(), npm: linuxNpm, bin: `${lh}/.nvm/versions/node/v22.13.0/bin/netlify`, real: `${lh}/.nvm/versions/node/v22.13.0/lib/node_modules/netlify-cli/bin/run.js`, method: "npm", plan: { kind: "manual", command: "npm install -g netlify-cli@latest" } }],
    ["netlify npm (macOS)", { tool: netlify, host: mac(), npm: macNpm, bin: "/opt/homebrew/bin/netlify", real: "/opt/homebrew/lib/node_modules/netlify-cli/bin/run.js", method: "npm", plan: npmAuto("netlify-cli") }],
    ["netlify npm (Windows)", { tool: netlify, host: windows(), npm: winNpm, bin: win(`${appData}/npm/netlify.cmd`), method: "npm", plan: npmAuto("netlify-cli") }],
    ["supabase .deb (Linux)", { tool: supabase, host: debian(), npm: linuxNpm, bin: "/usr/bin/supabase", method: "apt", plan: { kind: "manual", command: "curl -fsSL https://raw.githubusercontent.com/supabase/cli/main/install | bash" } }],
    ["supabase Homebrew (macOS)", { tool: supabase, host: mac(), npm: macNpm, bin: "/opt/homebrew/bin/supabase", real: "/opt/homebrew/Cellar/supabase/2.120.0/bin/supabase", method: "brew", plan: { kind: "manual", command: "brew upgrade supabase" } }],
    ["supabase Scoop (Windows)", { tool: supabase, host: windows(), npm: winNpm, bin: win(`${wh}/scoop/shims/supabase.exe`), method: "scoop", plan: { kind: "manual", command: "scoop update supabase" } }],
    ["supabase global npm (never auto)", { tool: supabase, host: linux(), npm: linuxNpm, bin: "/usr/local/bin/supabase", real: "/usr/local/lib/node_modules/supabase/dist/supabase.js", method: "npm", plan: { kind: "manual", command: "npm install -g supabase@latest" } }],
    ["gh apt (Debian)", { tool: gh, host: debian(), npm: linuxNpm, bin: "/usr/bin/gh", method: "apt", plan: { kind: "manual", command: "sudo apt update && sudo apt install --only-upgrade gh" } }],
    ["gh dnf (Fedora)", { tool: gh, host: fedora(), npm: linuxNpm, bin: "/usr/bin/gh", method: "apt", plan: { kind: "manual", command: "sudo dnf update gh" } }],
    ["gh Homebrew (macOS)", { tool: gh, host: mac(), npm: macNpm, bin: "/opt/homebrew/bin/gh", real: "/opt/homebrew/Cellar/gh/2.102.0/bin/gh", method: "brew", plan: { kind: "manual", command: "brew upgrade gh" } }],
    ["gh MSI / winget (Windows)", { tool: gh, host: windows(), npm: winNpm, bin: win("C:/Program Files/GitHub CLI/gh.exe"), method: "native", plan: { kind: "manual", command: "winget upgrade --id GitHub.cli --source winget", needsAdmin: false } }],
    ["gh Scoop (Windows)", { tool: gh, host: windows(), npm: winNpm, bin: win(`${wh}/scoop/shims/gh.exe`), method: "scoop", plan: { kind: "manual", command: "scoop update gh" } }],
    ["gh Chocolatey (Windows)", { tool: gh, host: windows(), npm: winNpm, bin: win("C:/ProgramData/chocolatey/bin/gh.exe"), method: "choco", plan: { kind: "manual", command: "choco upgrade gh -y", needsAdmin: true } }],
  ])("%s", async (_label, c) => check(c));
});

describe("AI agents", () => {
  it.each<[string, Case]>([
    ["cline npm (Linux)", { tool: cline, host: linux(), npm: linuxNpm, bin: "/usr/local/bin/cline", real: "/usr/local/lib/node_modules/cline/bin/cline", method: "npm", plan: npmAuto("cline") }],
    ["cline npm (macOS)", { tool: cline, host: mac(), npm: macNpm, bin: "/opt/homebrew/bin/cline", real: "/opt/homebrew/lib/node_modules/cline/bin/cline", method: "npm", plan: npmAuto("cline") }],
    ["cline npm (Windows)", { tool: cline, host: windows(), npm: winNpm, bin: win(`${appData}/npm/cline.cmd`), method: "npm", plan: npmAuto("cline") }],
    ["amp install script (Linux)", { tool: amp, host: linux(), npm: linuxNpm, bin: `${lh}/.local/bin/amp`, real: `${lh}/.amp/bin/amp`, method: "native", plan: { kind: "auto", command: [`${lh}/.local/bin/amp`, "update"] } }],
    ["amp Homebrew tap (macOS)", { tool: amp, host: mac(), npm: macNpm, bin: "/opt/homebrew/bin/amp", real: "/opt/homebrew/Cellar/ampcode/0.0.1791734437/bin/amp", method: "brew", plan: { kind: "manual", command: "brew upgrade ampcode" } }],
    ["amp @ampcode/cli (macOS)", { tool: amp, host: mac(), npm: macNpm, bin: "/opt/homebrew/bin/amp", real: "/opt/homebrew/lib/node_modules/@ampcode/cli/bin/amp", method: "npm", plan: npmAuto("@ampcode/cli") }],
    ["amp old @sourcegraph/amp (Linux)", { tool: amp, host: linux(), npm: linuxNpm, bin: "/usr/local/bin/amp", real: "/usr/local/lib/node_modules/@sourcegraph/amp/node_modules/@ampcode/cli/bin/amp", method: "npm", plan: { kind: "manual", command: "npm uninstall -g @sourcegraph/amp && npm install -g @ampcode/cli" } }],
    ["amp install.ps1 (Windows)", { tool: amp, host: windows(), npm: winNpm, bin: win(`${wh}/.amp/bin/amp.exe`), method: "native", plan: { kind: "auto", command: [win(`${wh}/.amp/bin/amp.exe`), "update"] } }],
    ["kiro install script (Linux)", { tool: kiro, host: linux(), npm: linuxNpm, bin: `${lh}/.local/bin/kiro-cli`, method: "native", plan: { kind: "auto", command: [`${lh}/.local/bin/kiro-cli`, "update", "--non-interactive"] } }],
    ["kiro dnf repo (Amazon Linux)", { tool: kiro, host: linux({ texts: { "/etc/os-release": `ID="amzn"${NL}ID_LIKE="fedora"${NL}` } }), npm: linuxNpm, bin: "/usr/bin/kiro-cli", method: "apt", plan: { kind: "manual", command: "sudo dnf upgrade kiro-cli" } }],
    ["kiro install script (macOS app bundle)", { tool: kiro, host: mac(), npm: macNpm, bin: `${mh}/.local/bin/kiro-cli`, real: "/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli", method: "native", plan: { kind: "auto" } }],
    ["kiro Homebrew cask (macOS)", { tool: kiro, host: mac(), npm: macNpm, bin: "/opt/homebrew/bin/kiro-cli", real: "/opt/homebrew/Caskroom/kiro-cli/2.29.1/Kiro CLI.app/Contents/MacOS/kiro-cli", method: "brew", plan: { kind: "manual", command: "brew upgrade --greedy kiro-cli" } }],
    ["kiro MSI (Windows 11)", { tool: kiro, host: windows(), npm: winNpm, bin: win("C:/Program Files/Kiro-Cli/kiro-cli.exe"), method: "native", plan: { kind: "auto" } }],
    ["goose script (Linux)", { tool: goose, host: linux(), npm: linuxNpm, bin: `${lh}/.local/bin/goose`, method: "native", plan: { kind: "auto", command: [`${lh}/.local/bin/goose`, "update"] } }],
    ["goose block-goose-cli (macOS)", { tool: goose, host: mac(), npm: macNpm, bin: "/opt/homebrew/bin/goose", real: "/opt/homebrew/Cellar/block-goose-cli/1.54.0/bin/goose", method: "brew", plan: { kind: "manual", command: "brew upgrade block-goose-cli" } }],
    ["goose download_cli.ps1 (Windows)", { tool: goose, host: windows(), npm: winNpm, bin: win(`${wh}/.local/bin/goose.exe`), method: "native", plan: { kind: "auto", command: [win(`${wh}/.local/bin/goose.exe`), "update"] } }],
    ["aider uv tool (Linux)", { tool: aider, host: uvLinux("aider-chat", "aider", "0.86.2"), npm: linuxNpm, bin: `${lh}/.local/bin/aider`, real: `${lh}/.local/share/uv/tools/aider-chat/bin/aider`, method: "uv", plan: { kind: "auto", command: ["uv", "tool", "upgrade", "aider-chat"] } }],
    ["aider Homebrew (macOS)", { tool: aider, host: mac(), npm: macNpm, bin: "/opt/homebrew/bin/aider", real: "/opt/homebrew/Cellar/aider/0.86.2/libexec/bin/aider", method: "brew", plan: { kind: "manual", command: "brew upgrade aider" } }],
    [
      "aider uv launcher (Windows)",
      {
        tool: aider,
        host: windows({
          env: { ...winEnv, PATH: win(`${wh}/.local/bin`), PATHEXT: ".EXE;.CMD" },
          files: [win(`${wh}/.local/bin/uv.exe`), win(`${appData}/uv/data/tools/aider-chat/Scripts/aider.exe`)],
          texts: { [win(`${appData}/uv/data/tools/aider-chat/Lib/site-packages/aider_chat-0.86.2.dist-info/METADATA`)]: meta("aider-chat", "0.86.2") },
        }),
        npm: winNpm,
        bin: win(`${wh}/.local/bin/aider.exe`),
        method: "uv",
        plan: { kind: "auto", command: ["uv", "tool", "upgrade", "aider-chat"] },
      },
    ],
    ["vibe uv tool (Linux, install script)", { tool: vibe, host: uvLinux("mistral-vibe", "vibe", "2.26.1"), npm: linuxNpm, bin: `${lh}/.local/bin/vibe`, real: `${lh}/.local/share/uv/tools/mistral-vibe/bin/vibe`, method: "uv", plan: { kind: "auto", command: ["uv", "tool", "upgrade", "mistral-vibe"] } }],
    ["vibe Homebrew (macOS)", { tool: vibe, host: mac(), npm: macNpm, bin: "/opt/homebrew/bin/vibe", real: "/opt/homebrew/Cellar/mistral-vibe/2.26.1/libexec/bin/vibe", method: "brew", plan: { kind: "manual", command: "brew upgrade mistral-vibe" } }],
  ])("%s", async (_label, c) => check(c));
});

describe("details", () => {
  it("Wrangler always carries Cloudflare's per-project advice; Supabase's project package is supabase", () => {
    expect(wrangler.notes).toEqual([
      { kind: "info", message: "Cloudflare recommends installing Wrangler per project (npm i -D wrangler).", url: "https://developers.cloudflare.com/workers/wrangler/install-and-update/" },
    ]);
    expect(supabase.projectPackages).toEqual(["supabase"]);
    expect(wrangler.npmPackage).toBe("wrangler");
  });

  it("the old @sourcegraph/amp package gets a migration note, the new one doesn't", () => {
    restore = setHost(linux());
    const old = instance("/usr/local/bin/amp", "npm", "/usr/local/lib/node_modules/@sourcegraph/amp/node_modules/@ampcode/cli/bin/amp");
    expect(amp.instanceNotes!(old)[0]).toMatchObject({ kind: "info", message: expect.stringContaining("npm uninstall -g @sourcegraph/amp && npm install -g @ampcode/cli") });
    expect(amp.instanceNotes!(instance("/usr/local/bin/amp", "npm", "/usr/local/lib/node_modules/@ampcode/cli/bin/amp"))).toEqual([]);
  });

  it("Kiro and GitHub CLI under Program Files need admin rights unless elevated", async () => {
    const host = windows({ writable: [wh] });
    restore = setHost(host);
    const k = instance(win("C:/Program Files/Kiro-Cli/kiro-cli.exe"), "native");
    expect(computeNeedsAdmin(kiro, k, await kiro.getUpdatePlan(k), host, null)).toBe(true);
    expect(computeNeedsAdmin(kiro, k, await kiro.getUpdatePlan(k), { ...host, elevated: true }, null)).toBe(false);
    const g = instance(win("C:/Program Files/GitHub CLI/gh.exe"), "native");
    // winget asks for elevation itself: no admin terminal needed.
    expect(computeNeedsAdmin(gh, g, await gh.getUpdatePlan(g), host, null)).toBe(false);
  });
});