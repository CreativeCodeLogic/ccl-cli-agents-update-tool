import { describe, expect, it } from "vitest";
import type { InstallMethod } from "../src/types";
import { classifyInstall, type ClassifyContext } from "../src/utils/installMethod";
import type { NpmGlobalPaths } from "../src/utils/npm";
import { fakeHost, win } from "./helpers";

interface Case {
  name: string;
  bin: string;
  real?: string;
  /** Extra files that must exist (node.exe siblings, node_modules dirs, ...). */
  files?: string[];
  expected: InstallMethod;
}

function run(platform: NodeJS.Platform, homedir: string, env: Record<string, string>, npmGlobal: NpmGlobalPaths | null, cases: Case[]) {
  for (const c of cases) {
    it(`${c.name} -> ${c.expected}`, () => {
      const host = fakeHost({ platform, homedir, env, files: [c.bin, ...(c.files ?? [])] });
      const ctx: ClassifyContext = { host, npmGlobal };
      expect(classifyInstall(c.bin, c.real ?? c.bin, ctx)).toBe(c.expected);
    });
  }
}

describe("classifyInstall (win32)", () => {
  const home = win("C:/Users/Jane Doe");
  const env = {
    LOCALAPPDATA: win(`${home}/AppData/Local`),
    APPDATA: win(`${home}/AppData/Roaming`),
    ProgramFiles: win("C:/Program Files"),
    "ProgramFiles(x86)": win("C:/Program Files (x86)"),
  };
  const npmGlobal = { prefix: win(`${home}/AppData/Roaming/npm`), root: win(`${home}/AppData/Roaming/npm/node_modules`) };

  run("win32", home, env, npmGlobal, [
    { name: "npm global shim in AppData Roaming", bin: win(`${home}/AppData/Roaming/npm/claude.cmd`), expected: "npm" },
    { name: "npm bundled with Node in Program Files", bin: win("C:/Program Files/nodejs/npm.cmd"), files: [win("C:/Program Files/nodejs/node.exe")], expected: "node" },
    { name: "Claude native installer in .local/bin", bin: win(`${home}/.local/bin/claude.exe`), expected: "native" },
    { name: "Kimi Code native installer", bin: win(`${home}/.kimi-code/bin/kimi.exe`), expected: "native" },
    { name: "Cloud SDK under Program Files (x86)", bin: win("C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd"), expected: "native" },
    { name: "Cloud SDK per-user under AppData (gcloud refines this to native)", bin: win(`${home}/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd`), expected: "unknown" },
    { name: "nvm4w global outside the current prefix", bin: win("C:/nvm4w/nodejs/codex.cmd"), files: [win("C:/nvm4w/nodejs/node_modules/@openai/codex/package.json")], expected: "npm" },
    { name: "nvm4w npm next to node.exe", bin: win("C:/nvm4w/nodejs/npm.cmd"), files: [win("C:/nvm4w/nodejs/node.exe")], expected: "node" },
    { name: "Volta shim in LOCALAPPDATA", bin: win(`${home}/AppData/Local/Volta/bin/claude.exe`), expected: "npm" },
    { name: "LOCALAPPDATA Programs installer", bin: win(`${home}/AppData/Local/Programs/foo/foo.exe`), expected: "native" },
    { name: "random tools folder", bin: win("D:/tools/foo.exe"), expected: "unknown" },
  ]);
});

describe("classifyInstall (darwin)", () => {
  const home = "/Users/jane";
  const npmGlobal = { prefix: "/opt/homebrew", root: "/opt/homebrew/lib/node_modules" };

  run("darwin", home, {}, npmGlobal, [
    { name: "Homebrew formula on Apple silicon", bin: "/opt/homebrew/bin/gemini", real: "/opt/homebrew/Cellar/gemini-cli/0.63.0/bin/gemini", expected: "brew" },
    { name: "Homebrew cask in /usr/local on Intel", bin: "/usr/local/bin/codex", real: "/usr/local/Caskroom/codex/0.162.1/codex-aarch64-apple-darwin", expected: "brew" },
    { name: "gcloud-cli cask", bin: "/opt/homebrew/bin/gcloud", real: "/opt/homebrew/Caskroom/gcloud-cli/588.0.0/google-cloud-sdk/bin/gcloud", expected: "brew" },
    { name: "legacy google-cloud-sdk cask", bin: "/usr/local/bin/gcloud", real: "/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud", expected: "brew" },
    { name: "npm global of a Homebrew Node (npm, not brew)", bin: "/opt/homebrew/bin/claude", real: "/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe", expected: "npm" },
    { name: "Homebrew formula that bundles node_modules", bin: "/opt/homebrew/bin/firebase", real: "/opt/homebrew/Cellar/firebase-cli/15.33.0/libexec/lib/node_modules/firebase-tools/lib/bin/firebase.js", expected: "brew" },
    { name: "Claude native symlink in ~/.local/bin", bin: `${home}/.local/bin/claude`, real: `${home}/.local/share/claude/versions/2.1.296`, expected: "native" },
    { name: "nvm global", bin: `${home}/.nvm/versions/node/v22.11.0/bin/codex`, real: `${home}/.nvm/versions/node/v22.11.0/lib/node_modules/@openai/codex/bin/codex.js`, expected: "npm" },
    { name: "nvm npm next to node", bin: `${home}/.nvm/versions/node/v22.11.0/bin/npm`, files: [`${home}/.nvm/versions/node/v22.11.0/bin/node`], expected: "node" },
    { name: "volta shim", bin: `${home}/.volta/bin/claude`, real: `${home}/.volta/bin/volta-shim`, expected: "npm" },
    { name: "fnm global", bin: `${home}/.local/state/fnm_multishells/123_456/bin/gemini`, real: `${home}/.local/share/fnm/node-versions/v22.11.0/installation/lib/node_modules/@google/gemini-cli/dist/index.js`, expected: "npm" },
  ]);
});

describe("classifyInstall (linux)", () => {
  const home = "/home/jane";
  const npmGlobal = { prefix: "/usr", root: "/usr/lib/node_modules" };

  run("linux", home, {}, npmGlobal, [
    { name: "gcloud from apt", bin: "/usr/bin/gcloud", real: "/usr/lib/google-cloud-sdk/bin/gcloud", expected: "apt" },
    { name: "gcloud from snap", bin: "/snap/bin/gcloud", real: "/usr/bin/snap", expected: "snap" },
    { name: "gcloud official archive in /opt", bin: "/opt/google-cloud-sdk/bin/gcloud", expected: "native" },
    { name: "Claude native in ~/.local/bin", bin: `${home}/.local/bin/claude`, real: `${home}/.local/share/claude/versions/2.1.296`, expected: "native" },
    { name: "legacy kimi-cli via uv tool", bin: `${home}/.local/bin/kimi`, real: `${home}/.local/share/uv/tools/kimi-cli/bin/kimi`, expected: "pip" },
    { name: "legacy kimi-cli via pipx", bin: `${home}/.local/bin/kimi`, real: `${home}/.local/share/pipx/venvs/kimi-cli/bin/kimi`, expected: "pip" },
    { name: "npm global with apt node in /usr/lib/node_modules (not apt)", bin: "/usr/bin/codex", real: "/usr/lib/node_modules/@openai/codex/bin/codex.js", expected: "npm" },
    { name: "npm bundled next to /usr/bin/node", bin: "/usr/bin/npm", real: "/usr/share/nodejs/npm/bin/npm-cli.js", files: ["/usr/bin/node"], expected: "node" },
    { name: "plain apt package", bin: "/usr/bin/gh", expected: "apt" },
    { name: "Linuxbrew", bin: "/home/linuxbrew/.linuxbrew/bin/gemini", real: "/home/linuxbrew/.linuxbrew/Cellar/gemini-cli/0.63.0/bin/gemini", expected: "brew" },
    { name: "nvm global", bin: `${home}/.nvm/versions/node/v20.18.0/bin/claude`, real: `${home}/.nvm/versions/node/v20.18.0/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`, expected: "npm" },
    { name: "volta shim", bin: `${home}/.volta/bin/gemini`, real: `${home}/.volta/bin/volta-shim`, expected: "npm" },
    { name: "fnm global", bin: `${home}/.local/share/fnm/node-versions/v22.11.0/installation/bin/codex`, real: `${home}/.local/share/fnm/node-versions/v22.11.0/installation/lib/node_modules/@openai/codex/bin/codex.js`, expected: "npm" },
    { name: "unknown location", bin: "/srv/tools/foo", expected: "unknown" },
  ]);

  it("recognizes node_modules globals even when npm is unavailable", () => {
    const host = fakeHost({ platform: "linux", homedir: home });
    expect(classifyInstall("/x/bin/codex", "/x/lib/node_modules/@openai/codex/bin/codex.js", { host, npmGlobal: null })).toBe("npm");
  });
});