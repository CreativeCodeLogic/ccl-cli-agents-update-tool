import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claude } from "../src/registry/claude";
import { codex } from "../src/registry/codex";
import { firebase } from "../src/registry/firebase";
import { gcloud, caskToken, sdkRoot } from "../src/registry/gcloud";
import { gemini } from "../src/registry/gemini";
import { kimi } from "../src/registry/kimi";
import { npm } from "../src/registry/npm";
import { setHost, type Host } from "../src/utils/host";
import { primeNpmGlobalPaths } from "../src/utils/npm";
import { fakeHost, instance, win } from "./helpers";

const linuxHome = "/home/jane";
const linuxNpm = { prefix: "/usr/local", root: "/usr/local/lib/node_modules" };

let restore: () => void = () => {};
function useHost(host: Host, npmGlobal: { prefix: string; root: string } | null = linuxNpm): void {
  restore();
  restore = setHost(host);
  primeNpmGlobalPaths(npmGlobal);
}
beforeEach(() => useHost(fakeHost({ platform: "linux", homedir: linuxHome })));
afterEach(() => restore());

describe("npm-distributed tools", () => {
  it("auto-updates a copy in the current npm global prefix", async () => {
    const i = instance("/usr/local/bin/claude", "npm", "/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe");
    expect(await claude.getUpdatePlan(i)).toEqual({ kind: "auto", command: ["npm", "install", "-g", "@anthropic-ai/claude-code@latest"] });
  });

  it("auto-updates a Windows shim in the npm prefix", async () => {
    const prefix = win("C:/Users/Jane/AppData/Roaming/npm");
    useHost(fakeHost({ platform: "win32", homedir: win("C:/Users/Jane") }), { prefix, root: win(`${prefix}/node_modules`) });
    const plan = await codex.getUpdatePlan(instance(win(`${prefix}/codex.cmd`), "npm"));
    expect(plan).toEqual({ kind: "auto", command: ["npm", "install", "-g", "@openai/codex@latest"] });
  });

  it("only prints the command for a copy under another Node prefix (nvm)", async () => {
    const i = instance(`${linuxHome}/.nvm/versions/node/v20.0.0/bin/codex`, "npm", `${linuxHome}/.nvm/versions/node/v20.0.0/lib/node_modules/@openai/codex/bin/codex.js`);
    const plan = await codex.getUpdatePlan(i);
    expect(plan.kind).toBe("manual");
    expect(plan).toMatchObject({ command: "npm install -g @openai/codex@latest" });
  });

  it("defers to Volta for Volta-managed copies", async () => {
    const plan = await gemini.getUpdatePlan(instance(`${linuxHome}/.volta/bin/gemini`, "npm", `${linuxHome}/.volta/bin/volta-shim`));
    expect(plan).toMatchObject({ kind: "manual", command: "volta install @google/gemini-cli" });
  });

  it("runs Claude's own updater on native installs, by absolute path", async () => {
    const bin = `${linuxHome}/.local/bin/claude`;
    expect(await claude.getUpdatePlan(instance(bin, "native"))).toEqual({ kind: "auto", command: [bin, "update"] });
  });

  it.each([
    [claude, "brew upgrade --cask claude-code"],
    [codex, "brew upgrade --cask codex"],
    [gemini, "brew upgrade gemini-cli"],
  ])("prints the Homebrew command for %#", async (tool, command) => {
    expect(await tool.getUpdatePlan(instance("/opt/homebrew/bin/x", "brew"))).toMatchObject({ kind: "manual", command });
  });

  it("prints the standalone Firebase installer per platform", async () => {
    expect(await firebase.getUpdatePlan(instance("/usr/local/bin/firebase", "native"))).toMatchObject({
      kind: "manual",
      command: "curl -sL https://firebase.tools | upgrade=true bash",
    });
    useHost(fakeHost({ platform: "win32", homedir: "C:/u" }));
    const plan = await firebase.getUpdatePlan(instance("C:/tools/firebase.exe", "native"));
    expect(plan.kind === "manual" && plan.command).toContain("firebase-tools-instant-win.exe");
  });

  it("refines unknown Firebase locations to the standalone binary", () => {
    expect(firebase.refineInstallMethod?.("unknown", { path: "/x/firebase", realPath: "/x/firebase" })).toBe("native");
  });
});

describe("Kimi Code", () => {
  it("auto-runs `kimi upgrade` for native installs and explains unchanged versions as a staged rollout", async () => {
    const i = instance(`${linuxHome}/.kimi-code/bin/kimi`, "native");
    expect(await kimi.getUpdatePlan(i)).toEqual({ kind: "auto", command: [i.path, "upgrade"] });
    expect(kimi.explainUnchanged?.(i, "Checking for updates... no update yet")).toMatchObject({ status: "held" });
    expect(kimi.explainUnchanged?.(instance("/usr/local/bin/kimi", "npm"), "")).toBeNull();
  });

  it("never calls it a staged rollout when the updater says it can't update", () => {
    const output = [
      "A newer version of @moonshot-ai/kimi-code is available (0.28.1 -> 2.1.1).",
      "Detected install source: native (windows). Auto-update is not supported on this platform.",
      "To update manually, run: irm https://code.kimi.com/kimi-code/install.ps1 | iex",
    ].join("\n");
    expect(kimi.explainUnchanged?.(instance("/home/jane/.kimi-code/bin/kimi", "native"), output)).toBeNull();
  });

  it("only prints the official installer for native installs on Windows (no self-update there)", async () => {
    useHost(fakeHost({ platform: "win32", homedir: win("C:/Users/Jane") }));
    const plan = await kimi.getUpdatePlan(instance(win("C:/Users/Jane/.kimi-code/bin/kimi.exe"), "native"));
    expect(plan).toMatchObject({ kind: "manual", command: "irm https://code.kimi.com/kimi-code/install.ps1 | iex" });
  });

  it("auto-updates npm installs of @moonshot-ai/kimi-code", async () => {
    const i = instance("/usr/local/bin/kimi", "npm", "/usr/local/lib/node_modules/@moonshot-ai/kimi-code/dist/main.mjs");
    expect(await kimi.getUpdatePlan(i)).toEqual({ kind: "auto", command: ["npm", "install", "-g", "@moonshot-ai/kimi-code@latest"] });
  });

  it.each([
    [`${linuxHome}/.local/share/uv/tools/kimi-cli/bin/kimi`, "uv tool upgrade kimi-cli"],
    [`${linuxHome}/.local/share/pipx/venvs/kimi-cli/bin/kimi`, "pipx upgrade kimi-cli"],
    ["/usr/lib/python3/site-packages/kimi/bin/kimi", "pip install -U kimi-cli"],
  ])("prints the legacy kimi-cli upgrade for %s", async (realPath, command) => {
    expect(await kimi.getUpdatePlan(instance(`${linuxHome}/.local/bin/kimi`, "pip", realPath))).toMatchObject({ kind: "manual", command });
  });

  it("uses PyPI only for the legacy channel", () => {
    expect(kimi.latestChannel?.("pip")).toBe("pypi");
    expect(kimi.latestChannel?.("native")).toBe("npm");
    expect(kimi.latestChannel?.()).toBe("npm");
  });

  it("tells uv launchers in ~/.local/bin apart from native installs on Windows", () => {
    const home = win("C:/Users/Jane");
    const appData = win(`${home}/AppData/Roaming`);
    const bin = win(`${home}/.local/bin/kimi.exe`);
    useHost(fakeHost({ platform: "win32", homedir: home, env: { APPDATA: appData }, files: [win(`${appData}/uv/tools/kimi-cli/pyvenv.cfg`)] }));
    expect(kimi.refineInstallMethod?.("native", { path: bin, realPath: bin })).toBe("pip");
    useHost(fakeHost({ platform: "win32", homedir: home, env: { APPDATA: appData } }));
    expect(kimi.refineInstallMethod?.("native", { path: bin, realPath: bin })).toBe("native");
  });
});

describe("Google Cloud CLI", () => {
  it("auto-runs the component manager when the SDK is user-writable", async () => {
    const root = `${linuxHome}/google-cloud-sdk`;
    useHost(fakeHost({ platform: "linux", homedir: linuxHome, files: [`${root}/VERSION`], writable: [linuxHome] }));
    const i = instance(`${root}/bin/gcloud`, "native");
    expect(sdkRoot(i)).toBe(root);
    expect(await gcloud.getUpdatePlan(i)).toEqual({ kind: "auto", command: [i.path, "components", "update", "--quiet"] });
  });

  it("asks for sudo when the SDK is not writable", async () => {
    useHost(fakeHost({ platform: "linux", homedir: linuxHome, files: ["/opt/google-cloud-sdk/VERSION"] }));
    expect(await gcloud.getUpdatePlan(instance("/opt/google-cloud-sdk/bin/gcloud", "native"))).toMatchObject({
      kind: "manual",
      command: "sudo gcloud components update",
    });
  });

  it("requires an elevated terminal under Program Files, even if the folder looks writable", async () => {
    const root = win("C:/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk");
    useHost(fakeHost({
      platform: "win32",
      homedir: win("C:/Users/Jane"),
      env: { "ProgramFiles(x86)": win("C:/Program Files (x86)") },
      files: [win(`${root}/VERSION`)],
      writable: [win("C:/")],
    }));
    const plan = await gcloud.getUpdatePlan(instance(win(`${root}/bin/gcloud.cmd`), "native"));
    expect(plan.kind).toBe("manual");
    expect(plan.kind === "manual" && plan.reason).toContain("Run as administrator");
  });

  it("auto-updates a per-user SDK under AppData", async () => {
    const root = win("C:/Users/Jane/AppData/Local/Google/Cloud SDK/google-cloud-sdk");
    useHost(fakeHost({ platform: "win32", homedir: win("C:/Users/Jane"), files: [win(`${root}/VERSION`)], writable: [win("C:/Users/Jane")] }));
    expect((await gcloud.getUpdatePlan(instance(win(`${root}/bin/gcloud.cmd`), "native"))).kind).toBe("auto");
  });

  it.each([
    ["apt", "sudo apt-get update && sudo apt-get install --only-upgrade google-cloud-cli"],
    ["snap", "sudo snap refresh google-cloud-cli"],
  ] as const)("never runs the component manager on %s installs", async (method, command) => {
    expect(await gcloud.getUpdatePlan(instance("/usr/bin/gcloud", method))).toMatchObject({ kind: "manual", command });
  });

  it.each([
    ["/opt/homebrew/Caskroom/gcloud-cli/588.0.0/google-cloud-sdk/bin/gcloud", "gcloud-cli"],
    ["/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud", "google-cloud-sdk"],
    ["/somewhere/else/bin/gcloud", "gcloud-cli"],
  ])("uses the cask token from %s", async (realPath, token) => {
    const i = instance("/opt/homebrew/bin/gcloud", "brew", realPath);
    expect(caskToken(i)).toBe(token);
    expect(await gcloud.getUpdatePlan(i)).toMatchObject({ kind: "manual", command: `brew upgrade --cask ${token}` });
  });

  it("finds the SDK root of snap installs", () => {
    useHost(fakeHost({ platform: "linux", homedir: linuxHome, files: ["/snap/google-cloud-cli/current/VERSION"] }));
    expect(sdkRoot(instance("/snap/bin/gcloud", "snap", "/usr/bin/snap"))).toBe("/snap/google-cloud-cli/current");
  });
});

describe("npm itself", () => {
  it("is never auto-updated, with a reason that matches where it came from", async () => {
    const bundled = await npm.getUpdatePlan(instance("/usr/bin/npm", "node"));
    const global = await npm.getUpdatePlan(instance("/usr/local/bin/npm", "npm"));
    expect(bundled).toMatchObject({ kind: "manual", command: "npm install -g npm@latest" });
    expect(bundled.kind === "manual" && bundled.reason).toContain("Bundled with Node.js");
    expect(global.kind === "manual" && global.reason).toContain("Version managers");
  });

  it("sends Homebrew's npm to `brew upgrade node`", async () => {
    expect(await npm.getUpdatePlan(instance("/opt/homebrew/bin/npm", "brew"))).toEqual({
      kind: "manual",
      command: "brew upgrade node",
      reason: "npm is bundled with Homebrew's Node.",
    });
  });

  it("follows Node's Windows npm.cmd delegation to the prefix npm", async () => {
    const home = win("C:/Users/Jane");
    const prefix = win(`${home}/AppData/Roaming/npm`);
    const nodeDir = win("C:/Program Files/nodejs");
    useHost(
      fakeHost({ platform: "win32", homedir: home, files: [win(`${nodeDir}/node.exe`), win(`${prefix}/node_modules/npm/package.json`)] }),
      { prefix, root: win(`${prefix}/node_modules`) },
    );
    const active = instance(win(`${nodeDir}/npm.cmd`), "node");
    expect(await npm.refineInstallMethod?.("node", active)).toBe("npm");
    expect(await npm.runsThrough?.(active, instance(win(`${prefix}/npm.cmd`), "npm"))).toBe(true);
    expect(await npm.runsThrough?.(active, instance(win("C:/other/npm.cmd"), "npm"))).toBe(false);
  });

  it("keeps a plain bundled npm as 'node' when the prefix has no npm of its own", async () => {
    const prefix = win("C:/Users/Jane/AppData/Roaming/npm");
    useHost(fakeHost({ platform: "win32", homedir: win("C:/Users/Jane") }), { prefix, root: win(`${prefix}/node_modules`) });
    expect(await npm.refineInstallMethod?.("node", instance(win("C:/Program Files/nodejs/npm.cmd"), "node"))).toBe("node");
  });
});