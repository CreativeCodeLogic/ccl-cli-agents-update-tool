import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { antigravity } from "../src/registry/antigravity";
import { copilot, isCopilotCli } from "../src/registry/copilot";
import { cursor, cursorVersionFromPath, isCursorAgent } from "../src/registry/cursor";
import { gemini } from "../src/registry/gemini";
import { opencode } from "../src/registry/opencode";
import { qwen } from "../src/registry/qwen";
import type { InstallMethod, ToolDescriptor } from "../src/types";
import { setHost, type Host } from "../src/utils/host";
import { classifyInstall } from "../src/utils/installMethod";
import { primeNpmGlobalPaths } from "../src/utils/npm";
import { fakeHost, instance, useFakeFetch, win } from "./helpers";

const linux = fakeHost({ platform: "linux", homedir: "/home/jane" });
const winHome = win("C:/Users/Jane");
const windows = fakeHost({
  platform: "win32",
  homedir: winHome,
  env: { LOCALAPPDATA: win(`${winHome}/AppData/Local`), APPDATA: win(`${winHome}/AppData/Roaming`) },
});
const npmGlobal = { prefix: "/usr/local", root: "/usr/local/lib/node_modules" };

let restore: () => void = () => {};
function useHost(host: Host) {
  restore();
  restore = setHost(host);
}
beforeEach(() => {
  useHost(linux);
  primeNpmGlobalPaths(npmGlobal);
});
const netRestores: (() => void)[] = [];
afterEach(() => {
  restore();
  vi.unstubAllGlobals();
  for (const r of netRestores.splice(0)) r();
});

/** Generic classification + the tool's own refinement, as the scan does it. */
async function methodOf(tool: ToolDescriptor, host: Host, bin: string, real = bin): Promise<InstallMethod> {
  useHost(host);
  const generic = classifyInstall(bin, real, { host, npmGlobal });
  return tool.refineInstallMethod ? tool.refineInstallMethod(generic, { path: bin, realPath: real }) : generic;
}

describe("install locations of the new tools", () => {
  it.each([
    ["Cursor (POSIX installer)", cursor, linux, "/home/jane/.local/bin/agent", "/home/jane/.local/share/cursor-agent/versions/2026.10.01-e373342/cursor-agent", "native"],
    ["Cursor (Windows installer)", cursor, windows, win(`${winHome}/AppData/Local/cursor-agent/agent.exe`), undefined, "native"],
    ["Cursor (Homebrew cask)", cursor, linux, "/opt/homebrew/bin/cursor-agent", "/opt/homebrew/Caskroom/cursor-cli/2026.10.01-e373342/dist-package/cursor-agent", "brew"],
    ["OpenCode (install script)", opencode, linux, "/home/jane/.opencode/bin/opencode", undefined, "native"],
    ["OpenCode (npm v1)", opencode, linux, "/usr/local/bin/opencode", "/usr/local/lib/node_modules/opencode-ai/bin/opencode.exe", "npm"],
    ["OpenCode (Chocolatey)", opencode, windows, win("C:/ProgramData/chocolatey/bin/opencode.exe"), undefined, "choco"],
    ["OpenCode (Scoop)", opencode, windows, win(`${winHome}/scoop/shims/opencode.exe`), undefined, "scoop"],
    ["Antigravity (POSIX script)", antigravity, linux, "/home/jane/.local/bin/agy", undefined, "native"],
    ["Antigravity (Windows script)", antigravity, windows, win(`${winHome}/AppData/Local/agy/bin/agy.exe`), undefined, "native"],
    ["Antigravity (winget)", antigravity, windows, win(`${winHome}/AppData/Local/Microsoft/WinGet/Links/agy.exe`), undefined, "winget"],
    ["Qwen (POSIX standalone)", qwen, linux, "/home/jane/.local/bin/qwen", "/home/jane/.local/lib/qwen-code/bin/qwen", "native"],
    ["Qwen (Windows standalone)", qwen, windows, win(`${winHome}/AppData/Local/qwen-code/bin/qwen.cmd`), undefined, "native"],
    ["Qwen (Homebrew core)", qwen, linux, "/home/linuxbrew/.linuxbrew/bin/qwen", "/home/linuxbrew/.linuxbrew/Cellar/qwen-code/0.25.0/bin/qwen", "brew"],
    ["Copilot (install script, root)", copilot, linux, "/usr/local/bin/copilot", undefined, "native"],
    ["Copilot (Homebrew cask)", copilot, linux, "/opt/homebrew/bin/copilot", "/opt/homebrew/Caskroom/copilot-cli/1.0.95/copilot", "brew"],
    ["Copilot (winget)", copilot, windows, win(`${winHome}/AppData/Local/Microsoft/WinGet/Links/copilot.exe`), undefined, "winget"],
  ] as const)("%s -> %s", async (_label, tool, host, bin, real, expected) => {
    expect(await methodOf(tool, host, bin, real ?? bin)).toBe(expected);
  });
});

describe("telling generic binaries apart", () => {
  it("claims `agent` only inside Cursor's install layout", () => {
    expect(isCursorAgent({ path: "/home/jane/.local/bin/agent", realPath: "/home/jane/.local/share/cursor-agent/versions/2026.10.01-e373342/cursor-agent" })).toBe(true);
    expect(isCursorAgent({ path: "/opt/homebrew/bin/cursor-agent", realPath: "/opt/homebrew/Caskroom/cursor-cli/x/dist-package/cursor-agent" })).toBe(true);
    expect(isCursorAgent({ path: "/usr/bin/agent", realPath: "/usr/bin/agent" })).toBe(false);
    expect(isCursorAgent({ path: "/home/jane/.local/bin/agent", realPath: "/home/jane/.local/bin/agent" })).toBe(false);
  });

  it("claims Windows' %LOCALAPPDATA%/cursor-agent/agent.exe", () => {
    useHost(windows);
    const exe = win(`${winHome}/AppData/Local/cursor-agent/agent.exe`);
    expect(isCursorAgent({ path: exe, realPath: exe })).toBe(true);
  });

  it("ignores the VS Code Copilot Chat launcher, which prompts to install the CLI", () => {
    useHost(windows);
    const shim = win(`${winHome}/AppData/Roaming/Code/User/globalStorage/github.copilot-chat/copilotCli/copilot.bat`);
    expect(isCopilotCli({ path: shim, realPath: shim })).toBe(false);
    const npmShim = win(`${winHome}/AppData/Roaming/npm/copilot.cmd`);
    expect(isCopilotCli({ path: npmShim, realPath: npmShim })).toBe(true);
    expect(copilot.identify?.({ path: shim, realPath: shim })).toBe(false);
  });

  it("reads Cursor's version from its versioned install directory", () => {
    expect(cursorVersionFromPath({ realPath: "/home/jane/.local/share/cursor-agent/versions/2026.10.01-e373342/cursor-agent" })).toBe("2026.10.01-e373342");
    expect(cursorVersionFromPath({ realPath: "/home/jane/.local/share/cursor-agent/versions/2026.06.12-19-59-36-f6aba9a/cursor-agent" })).toBe("2026.06.12-19-59-36-f6aba9a");
    expect(cursorVersionFromPath({ realPath: "/usr/local/bin/agent" })).toBeNull();
  });
});

describe("update plans of the new tools", () => {
  it.each([
    [copilot, "native", "/home/jane/.local/bin/copilot", ["/home/jane/.local/bin/copilot", "update"]],
    [cursor, "native", "/home/jane/.local/bin/agent", ["/home/jane/.local/bin/agent", "update"]],
    [opencode, "native", "/home/jane/.opencode/bin/opencode", ["/home/jane/.opencode/bin/opencode", "upgrade"]],
    [antigravity, "native", "/home/jane/.local/bin/agy", ["/home/jane/.local/bin/agy", "update"]],
    [qwen, "native", "/home/jane/.local/bin/qwen", ["/home/jane/.local/bin/qwen", "update"]],
  ] as const)("runs the documented self-updater of %#", async (tool, method, bin, command) => {
    expect(await tool.getUpdatePlan(instance(bin, method))).toEqual({ kind: "auto", command });
  });

  it.each([
    [copilot, "brew", "brew upgrade --cask copilot-cli"],
    [cursor, "brew", "brew upgrade --cask cursor-cli"],
    [opencode, "brew", "brew upgrade opencode"],
    [opencode, "choco", "choco upgrade opencode -y"],
    [opencode, "scoop", "scoop update opencode"],
    [antigravity, "brew", "brew upgrade --cask --greedy antigravity-cli"],
    [qwen, "brew", "brew upgrade qwen-code"],
  ] as const)("only prints the package-manager command (%#)", async (tool, method, command) => {
    expect(await tool.getUpdatePlan(instance("/x/bin/tool", method))).toMatchObject({ kind: "manual", command });
  });

  it("auto-updates npm installs with the right package", async () => {
    const plan = async (tool: ToolDescriptor, real: string) => tool.getUpdatePlan(instance("/usr/local/bin/x", "npm", real));
    expect(await plan(copilot, "/usr/local/lib/node_modules/@github/copilot/npm-loader.js")).toMatchObject({ command: ["npm", "install", "-g", "@github/copilot@latest"] });
    expect(await plan(qwen, "/usr/local/lib/node_modules/@qwen-code/qwen-code/cli-entry.js")).toMatchObject({ command: ["npm", "install", "-g", "@qwen-code/qwen-code@latest"] });
    expect(await plan(opencode, "/usr/local/lib/node_modules/opencode-ai/bin/opencode.exe")).toMatchObject({ command: ["npm", "install", "-g", "opencode-ai@latest"] });
    expect(await plan(opencode, "/usr/local/lib/node_modules/@opencode/cli/bin/opencode")).toMatchObject({ command: ["npm", "install", "-g", "@opencode/cli@latest"] });
  });
});

describe("latest versions and states", () => {
  it("compares OpenCode v2 installs with the v2 release line", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      Response.json({ version: String(url).includes("%40opencode") || String(url).includes("@opencode/cli") ? "2.0.26" : "1.18.35" }),
    );
    netRestores.push(useFakeFetch(fetchMock));
    expect(opencode.latestChannel?.("npm", "1.18.0")).toBe("v1");
    expect(opencode.latestChannel?.("brew", "2.0.25")).toBe("v2");
    expect(await opencode.getLatestVersion("brew", "2.0.25")).toBe("2.0.26");
    expect(await opencode.getLatestVersion("npm", "1.18.0")).toBe("1.18.35");
  });

  it("reads Antigravity's latest release tag", async () => {
    netRestores.push(useFakeFetch(vi.fn(async () => Response.json({ tag_name: "v1.3.3" }))));
    expect(await antigravity.getLatestVersion()).toBe("1.3.3");
  });

  it("marks Cursor as self-updating and Gemini as retired in favour of Antigravity", () => {
    expect(cursor.selfUpdating).toBe(true);
    expect(gemini.deprecation).toMatchObject({ successorId: "antigravity", since: "2026-06-18" });
  });
});