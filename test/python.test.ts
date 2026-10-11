import { afterEach, describe, expect, it, vi } from "vitest";
import { createPythonPackageTool } from "../src/registry/python-package-tool";
import { computeNeedsAdmin } from "../src/scan";
import { classifyInstall } from "../src/utils/installMethod";
import { setHost, type Host } from "../src/utils/host";
import { detectPythonInstall, distInfoVersion, pipxHomes, pythonUpdatePlan, uvToolDirs } from "../src/utils/python";
import { fakeHost, instance, useFakeFetch, win } from "./helpers";

const NL = String.fromCharCode(10);
const metadata = (version: string) => `Metadata-Version: 2.1${NL}Name: aider-chat${NL}Version: ${version}${NL}`;
/** dist-info METADATA for aider-chat inside a site-packages folder. */
const dist = (sitePackages: string, version = "0.86.1", sep = "/") => ({
  [`${sitePackages}${sep}aider_chat-${version}.dist-info${sep}METADATA`]: metadata(version),
});

const restores: (() => void)[] = [];
afterEach(() => {
  for (const r of restores.splice(0)) r();
});
const use = (host: Host) => {
  restores.push(setHost(host));
  return host;
};

describe("documented uv and pipx locations", () => {
  it("uv tool dirs: UV_TOOL_DIR, XDG_DATA_HOME or ~/.local/share on Unix; APPDATA/uv/data/tools on Windows", () => {
    expect(uvToolDirs(fakeHost({ platform: "linux", homedir: "/home/jane" }))).toEqual(["/home/jane/.local/share/uv/tools"]);
    expect(uvToolDirs(fakeHost({ platform: "linux", homedir: "/home/jane", env: { XDG_DATA_HOME: "/data", UV_TOOL_DIR: "/tools" } }))).toEqual([
      "/tools",
      "/data/uv/tools",
    ]);
    expect(uvToolDirs(fakeHost({ platform: "darwin", homedir: "/Users/jane" }))).toEqual(["/Users/jane/.local/share/uv/tools"]);
    const appData = win("C:/Users/Jane/AppData/Roaming");
    expect(uvToolDirs(fakeHost({ platform: "win32", homedir: win("C:/Users/Jane"), env: { APPDATA: appData } }))).toEqual([
      win(`${appData}/uv/data/tools`),
      win(`${appData}/uv/tools`), // older uv releases
    ]);
  });

  it("pipx homes: PIPX_HOME, legacy ~/.local/pipx, then the per-OS default", () => {
    expect(pipxHomes(fakeHost({ platform: "linux", homedir: "/home/jane" }))).toEqual(["/home/jane/.local/pipx", "/home/jane/.local/share/pipx"]);
    expect(pipxHomes(fakeHost({ platform: "linux", homedir: "/home/jane", env: { PIPX_HOME: "/opt/px" } }))[0]).toBe("/opt/px");
    expect(pipxHomes(fakeHost({ platform: "darwin", homedir: "/Users/jane" }))).toContain("/Users/jane/Library/Application Support/pipx");
    const home = win("C:/Users/Jane");
    const local = win(`${home}/AppData/Local`);
    expect(pipxHomes(fakeHost({ platform: "win32", homedir: home, env: { LOCALAPPDATA: local } }))).toEqual([
      win(`${home}/.local/pipx`),
      win(`${home}/pipx`), // legacy Windows default
      win(`${local}/pipx/pipx`),
    ]);
  });
});

describe("detectPythonInstall", () => {
  const home = "/home/jane";
  const uvVenv = `${home}/.local/share/uv/tools/aider-chat`;
  const pipxVenv = `${home}/.local/share/pipx/venvs/aider-chat`;

  it("uv: a ~/.local/bin symlink into the tool environment, version from METADATA", () => {
    const host = fakeHost({ platform: "linux", homedir: home, texts: dist(`${uvVenv}/lib/python3.12/site-packages`) });
    const found = detectPythonInstall(`${home}/.local/bin/aider`, `${uvVenv}/bin/aider`, "aider-chat", host);
    expect(found).toEqual({ kind: "uv", venv: uvVenv, sitePackages: `${uvVenv}/lib/python3.12/site-packages`, userSite: false });
    expect(distInfoVersion(found!.sitePackages, "aider-chat", host)).toBe("0.86.1");
    expect(classifyInstall(`${home}/.local/bin/aider`, `${uvVenv}/bin/aider`, { host, npmGlobal: null })).toBe("uv");
  });

  it("uv on Windows: a copied launcher in %USERPROFILE%/.local/bin, environment under APPDATA/uv/data/tools", () => {
    const h = win("C:/Users/Jane");
    const venv = win(`${h}/AppData/Roaming/uv/data/tools/aider-chat`);
    const host = fakeHost({ platform: "win32", homedir: h, env: { APPDATA: win(`${h}/AppData/Roaming`) }, files: [win(`${venv}/Scripts/aider.exe`)], texts: dist(win(`${venv}/Lib/site-packages`), "0.86.1", String.fromCharCode(92)) });
    const bin = win(`${h}/.local/bin/aider.exe`);
    expect(detectPythonInstall(bin, bin, "aider-chat", host)).toMatchObject({ kind: "uv", venv });
  });

  it("honors UV_TOOL_DIR", () => {
    const host = fakeHost({ platform: "linux", homedir: home, env: { UV_TOOL_DIR: "/srv/uv" }, texts: dist("/srv/uv/aider-chat/lib/python3.11/site-packages") });
    expect(detectPythonInstall(`${home}/.local/bin/aider`, "/srv/uv/aider-chat/bin/aider", "aider-chat", host)?.kind).toBe("uv");
  });

  it.each([
    ["Linux default", "linux", home, `${home}/.local/share/pipx/venvs/aider-chat`, {}],
    ["legacy ~/.local/pipx", "linux", home, `${home}/.local/pipx/venvs/aider-chat`, {}],
    ["PIPX_HOME", "linux", home, "/opt/px/venvs/aider-chat", { PIPX_HOME: "/opt/px" }],
    ["macOS default", "darwin", "/Users/jane", "/Users/jane/Library/Application Support/pipx/venvs/aider-chat", {}],
  ] as const)("pipx: %s", (_label, platform, h, venv, env) => {
    const host = fakeHost({ platform, homedir: h, env: { ...env }, texts: dist(`${venv}/lib/python3.12/site-packages`) });
    expect(detectPythonInstall(`${h}/.local/bin/aider`, `${venv}/bin/aider`, "aider-chat", host)).toMatchObject({ kind: "pipx", venv });
  });

  it("pipx on Windows (LOCALAPPDATA/pipx/pipx and the legacy ~/pipx)", () => {
    const h = win("C:/Users/Jane");
    const local = win(`${h}/AppData/Local`);
    for (const venv of [win(`${local}/pipx/pipx/venvs/aider-chat`), win(`${h}/pipx/venvs/aider-chat`)]) {
      const host = fakeHost({ platform: "win32", homedir: h, env: { LOCALAPPDATA: local }, files: [win(`${venv}/Scripts/aider.exe`)], texts: dist(win(`${venv}/Lib/site-packages`), "0.86.1", String.fromCharCode(92)) });
      const bin = win(`${h}/.local/bin/aider.exe`);
      expect(detectPythonInstall(bin, bin, "aider-chat", host)).toMatchObject({ kind: "pipx", venv });
    }
  });

  it("pip: a Scripts/bin directory confirmed by the dist-info folder (user site and system)", () => {
    const h = win("C:/Users/Jane");
    const appData = win(`${h}/AppData/Roaming`);
    const userScripts = win(`${appData}/Python/Python313/Scripts`);
    const winHost = fakeHost({ platform: "win32", homedir: h, env: { APPDATA: appData }, texts: dist(win(`${appData}/Python/Python313/site-packages`), "0.86.1", String.fromCharCode(92)) });
    const bin = win(`${userScripts}/aider.exe`);
    expect(detectPythonInstall(bin, bin, "aider-chat", winHost)).toMatchObject({ kind: "pip", userSite: true });

    const sys = fakeHost({ platform: "linux", homedir: home, texts: dist("/usr/local/lib/python3.12/dist-packages") });
    expect(detectPythonInstall("/usr/local/bin/aider", "/usr/local/bin/aider", "aider-chat", sys)).toMatchObject({ kind: "pip", userSite: false });
    // No dist-info: not claimed as a pip install.
    expect(detectPythonInstall("/usr/local/bin/aider", "/usr/local/bin/aider", "aider-chat", fakeHost({ platform: "linux", homedir: home }))).toBeNull();
  });

  it("matches dist-info names after PEP 503 normalization", () => {
    const host = fakeHost({ platform: "linux", homedir: home, texts: { [`${pipxVenv}/lib/python3.12/site-packages/Aider_Chat-0.9.0.dist-info/METADATA`]: metadata("0.9.0") } });
    // aider.chat and aider-chat are the same PyPI project: same environment, same dist-info.
    expect(detectPythonInstall(`${home}/.local/bin/aider`, `${pipxVenv}/bin/aider`, "aider.chat", host)).toMatchObject({ kind: "pipx" });
    expect(distInfoVersion(`${pipxVenv}/lib/python3.12/site-packages`, "aider-chat", host)).toBe("0.9.0");
  });
});

describe("Python update plans", () => {
  const install = { sitePackages: "/x", venv: "/v", userSite: false };
  it("uv and pipx upgrade automatically when the manager is on PATH", () => {
    expect(pythonUpdatePlan({ ...install, kind: "uv" }, "aider-chat", true)).toEqual({ kind: "auto", command: ["uv", "tool", "upgrade", "aider-chat"] });
    expect(pythonUpdatePlan({ ...install, kind: "pipx" }, "aider-chat", true)).toEqual({ kind: "auto", command: ["pipx", "upgrade", "aider-chat"] });
    expect(pythonUpdatePlan({ ...install, kind: "uv" }, "aider-chat", false)).toMatchObject({ kind: "manual", command: "uv tool upgrade aider-chat" });
  });

  it("pip is always a command to copy (PEP 668)", () => {
    expect(pythonUpdatePlan({ ...install, venv: null, kind: "pip" }, "aider-chat", true)).toMatchObject({
      kind: "manual",
      command: "python -m pip install --upgrade aider-chat",
      reason: expect.stringContaining("PEP 668"),
    });
    expect(pythonUpdatePlan({ ...install, venv: null, kind: "pip", userSite: true }, "aider-chat", true)).toMatchObject({
      command: "python -m pip install --upgrade --user aider-chat",
    });
  });
});

describe("createPythonPackageTool", () => {
  const home = "/home/jane";
  const venv = `${home}/.local/share/uv/tools/aider-chat`;
  const tool = createPythonPackageTool({ id: "aider", name: "Aider", binNames: ["aider"], pypi: "aider-chat", group: "agents", description: "d", docsUrl: "https://example.test" });

  it("detects, reads the version without spawning, plans and finds the update target", async () => {
    use(fakeHost({ platform: "linux", homedir: home, env: { PATH: "/usr/bin" }, files: ["/usr/bin/uv"], texts: dist(`${venv}/lib/python3.12/site-packages`) }));
    const i = instance(`${home}/.local/bin/aider`, "uv", `${venv}/bin/aider`);
    expect(tool.group).toBe("agents");
    expect(tool.refineInstallMethod?.("native", i)).toBe("uv");
    expect(await tool.getInstalledVersion(i)).toBe("0.86.1");
    expect(await tool.getUpdatePlan(i)).toEqual({ kind: "auto", command: ["uv", "tool", "upgrade", "aider-chat"] });
    expect(tool.updateTargetDir?.(i)).toBe(venv);
  });

  it("reads the latest version from PyPI through the shared network layer", async () => {
    const fetch = vi.fn(async (url: string) => (url === "https://pypi.org/pypi/aider-chat/json" ? Response.json({ info: { version: "0.87.0" } }) : new Response("", { status: 404 })));
    restores.push(useFakeFetch(fetch));
    expect(await tool.getLatestVersion()).toBe("0.87.0");
  });

  it("flags a pip install in a site-packages the user can't write to as needs admin", async () => {
    const host = use(fakeHost({ platform: "linux", homedir: home, writable: [home], texts: dist("/usr/lib/python3.12/site-packages") }));
    const i = instance("/usr/bin/aider", "pip", "/usr/bin/aider");
    const plan = await tool.getUpdatePlan(i);
    expect(plan).toMatchObject({ kind: "manual", command: "python -m pip install --upgrade aider-chat" });
    expect(computeNeedsAdmin(tool, i, plan, host, null)).toBe(true);
  });
});