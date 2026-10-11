import { afterEach, describe, expect, it, vi } from "vitest";
import { amp, isAmpcode } from "../src/registry/amp";
import { cline } from "../src/registry/cline";
import { classifyGoosePath, goose, isGooseVersionOutput } from "../src/registry/goose";
import { vibe } from "../src/registry/vibe";
import { detectAll } from "../src/scan";
import { setHost, type Host } from "../src/utils/host";
import { fakeHost, instance, win } from "./helpers";

const restores: (() => void)[] = [];
afterEach(() => {
  for (const r of restores.splice(0)) r();
});
const use = (host: Host) => {
  restores.push(setHost(host));
  return host;
};
const NL = String.fromCharCode(10);
const home = "/home/dev";

describe("generic binary names are identified before they are claimed", () => {
  it("amp: the amp.rs text editor (cargo or the `amp` formula) is not Amp, and is never run", async () => {
    // Both editors on PATH; nothing here may be executed (the editor would open full screen).
    const host = use(
      fakeHost({
        platform: "linux",
        homedir: home,
        env: { PATH: `${home}/.cargo/bin:/home/linuxbrew/.linuxbrew/bin` },
        files: [`${home}/.cargo/bin/amp`, "/home/linuxbrew/.linuxbrew/Cellar/amp/0.7.1/bin/amp"],
        links: { "/home/linuxbrew/.linuxbrew/bin/amp": "/home/linuxbrew/.linuxbrew/Cellar/amp/0.7.1/bin/amp" },
      }),
    );
    expect(isAmpcode({ path: `${home}/.cargo/bin/amp`, realPath: `${home}/.cargo/bin/amp` }, host)).toBe(false);
    expect(isAmpcode({ path: "/home/linuxbrew/.linuxbrew/bin/amp", realPath: "/home/linuxbrew/.linuxbrew/Cellar/amp/0.7.1/bin/amp" }, host)).toBe(false);
    const getInstalledVersion = vi.spyOn(amp, "getInstalledVersion");
    const [detection] = await detectAll([amp], host);
    expect(detection!.instances).toEqual([]); // not installed
    expect(getInstalledVersion).not.toHaveBeenCalled();
    getInstalledVersion.mockRestore();
  });

  it("amp: claims the install-script folder (incl. AMP_HOME), the ampcode formula and both npm names", () => {
    const host = fakeHost({ platform: "linux", homedir: home, env: { AMP_HOME: "/opt/amp" } });
    expect(isAmpcode({ path: `${home}/.local/bin/amp`, realPath: "/opt/amp/bin/amp" }, host)).toBe(true);
    expect(isAmpcode({ path: "/opt/homebrew/bin/amp", realPath: "/opt/homebrew/Cellar/ampcode/0.0.1/bin/amp" }, host)).toBe(true);
    expect(isAmpcode({ path: "/usr/local/bin/amp", realPath: "/usr/local/lib/node_modules/@ampcode/cli/bin/amp" }, host)).toBe(true);
    expect(isAmpcode({ path: "/usr/local/bin/amp", realPath: "/usr/local/lib/node_modules/@sourcegraph/amp/node_modules/@ampcode/cli/bin/amp.exe" }, host)).toBe(true);
    const h = win("C:/Users/Jane");
    const winHost = fakeHost({ platform: "win32", homedir: h, files: [win(`${h}/AppData/Roaming/npm/node_modules/@ampcode/cli/package.json`)] });
    expect(isAmpcode({ path: win(`${h}/.amp/bin/amp.exe`), realPath: win(`${h}/.amp/bin/amp.exe`) }, winHost)).toBe(true);
    expect(isAmpcode({ path: win(`${h}/AppData/Roaming/npm/amp.cmd`), realPath: win(`${h}/AppData/Roaming/npm/amp.cmd`) }, winHost)).toBe(true);
    expect(isAmpcode({ path: win(`${h}/.cargo/bin/amp.exe`), realPath: win(`${h}/.cargo/bin/amp.exe`) }, winHost)).toBe(false);
  });

  it("goose: pressly/goose (~/go/bin, GOPATH, the `goose` formula) is rejected without running it", () => {
    const host = fakeHost({ platform: "darwin", homedir: "/Users/dev", env: { GOPATH: "/Users/dev/gocode" } });
    expect(classifyGoosePath({ path: "/Users/dev/go/bin/goose", realPath: "/Users/dev/go/bin/goose" }, host)).toBe("other");
    expect(classifyGoosePath({ path: "/Users/dev/gocode/bin/goose", realPath: "/Users/dev/gocode/bin/goose" }, host)).toBe("other");
    expect(classifyGoosePath({ path: "/opt/homebrew/bin/goose", realPath: "/opt/homebrew/Cellar/goose/3.28.0/bin/goose" }, host)).toBe("other");
    expect(classifyGoosePath({ path: "/usr/local/bin/goose", realPath: "/usr/local/bin/goose" }, host)).toBe("other");
    expect(classifyGoosePath({ path: "/opt/homebrew/bin/goose", realPath: "/opt/homebrew/Cellar/block-goose-cli/1.54.0/bin/goose" }, host)).toBe("goose");
    expect(classifyGoosePath({ path: "/Users/dev/.local/bin/goose", realPath: "/Users/dev/.local/bin/goose" }, host)).toBe("check");
    const h = win("C:/Users/Jane");
    const winHost = fakeHost({ platform: "win32", homedir: h });
    expect(classifyGoosePath({ path: win(`${h}/goose/goose.exe`), realPath: win(`${h}/goose/goose.exe`) }, winHost)).toBe("check");
    expect(classifyGoosePath({ path: win(`${h}/.local/bin/goose.exe`), realPath: win(`${h}/.local/bin/goose.exe`) }, winHost)).toBe("check");
    expect(classifyGoosePath({ path: win(`${h}/go/bin/goose.exe`), realPath: win(`${h}/go/bin/goose.exe`) }, winHost)).toBe("other");
  });

  it("goose: in a shared folder like ~/.local/bin, the --version signature decides", () => {
    expect(isGooseVersionOutput(" 1.54.0" + NL)).toBe(true);
    expect(isGooseVersionOutput("1.54.0")).toBe(true);
    expect(isGooseVersionOutput("goose version: v3.28.0" + NL)).toBe(false); // pressly
    expect(isGooseVersionOutput("")).toBe(false);
  });

  it("goose: a fake pressly goose in ~/.local/bin is not installed (real process)", async () => {
    // A real script that prints pressly's version line, placed where Goose installs itself.
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ccl-caut-goose-"));
    restores.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const bin = path.join(dir, ".local", "bin");
    fs.mkdirSync(bin, { recursive: true });
    const isWin = process.platform === "win32";
    const script = path.join(bin, isWin ? "goose.cmd" : "goose");
    fs.writeFileSync(script, isWin ? "@echo goose version: v3.28.0" + String.fromCharCode(13, 10) : "#!/bin/sh" + NL + "echo 'goose version: v3.28.0'" + NL, { mode: 0o755 });
    const pressly = { path: script, realPath: script };
    const host = use({ ...fakeHost({ platform: process.platform, homedir: dir }), fs: (await import("../src/utils/host")).nodeFs });
    expect(classifyGoosePath(pressly, host)).toBe("check");
    expect(await goose.identify!(pressly)).toBe(false);
    fs.writeFileSync(script, isWin ? "@echo  1.54.0" + String.fromCharCode(13, 10) : "#!/bin/sh" + NL + "echo ' 1.54.0'" + NL, { mode: 0o755 });
    expect(await goose.identify!(pressly)).toBe(true);
  });

  it("vibe: only a binary inside the mistral-vibe package (uv/pipx/pip or its formula) is Mistral Vibe", () => {
    const venv = `${home}/.local/share/uv/tools/mistral-vibe`;
    use(fakeHost({ platform: "linux", homedir: home, texts: { [`${venv}/lib/python3.12/site-packages/mistral_vibe-2.26.1.dist-info/METADATA`]: "Name: mistral-vibe" + NL + "Version: 2.26.1" + NL } }));
    expect(vibe.identify!({ path: `${home}/.local/bin/vibe`, realPath: `${venv}/bin/vibe` })).toBe(true);
    expect(vibe.identify!({ path: "/usr/local/bin/vibe", realPath: "/usr/local/lib/node_modules/vibe-cli/bin/vibe.js" })).toBe(false);
    expect(vibe.identify!({ path: "/opt/homebrew/bin/vibe", realPath: "/opt/homebrew/Cellar/mistral-vibe/2.26.1/bin/vibe" })).toBe(true);
  });

  it("cline: only the cline npm package (or its formula)", () => {
    use(fakeHost({ platform: "linux", homedir: home }));
    expect(cline.identify!({ path: "/usr/local/bin/cline", realPath: "/usr/local/lib/node_modules/cline/bin/cline" })).toBe(true);
    expect(cline.identify!({ path: "/usr/local/bin/cline", realPath: "/usr/local/bin/cline" })).toBe(false);
  });

  it("instance helper still builds instances", () => {
    expect(instance("/x", "npm").installMethod).toBe("npm");
  });
});