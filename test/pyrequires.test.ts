import { afterEach, describe, expect, it, vi } from "vitest";
import { pythonCompatibility } from "../src/registry/python-package-tool";
import { vibe } from "../src/registry/vibe";
import { LatestResolver, resolveLatest } from "../src/scan";
import { initialSelection, isOffered } from "../src/selection";
import { setHost, type Host } from "../src/utils/host";
import { primeNpmGlobalPaths } from "../src/utils/npm";
import { parsePyvenvVersion, pythonFits, pythonVersionFromPath, satisfiesSpec, suggestPython } from "../src/utils/pyrequires";
import type { PythonInstall } from "../src/utils/python";
import { fakeHost, useFakeFetch, win } from "./helpers";

const NL = String.fromCharCode(10);
const restores: (() => void)[] = [];
afterEach(() => {
  for (const r of restores.splice(0)) r();
});
const use = (host: Host) => {
  restores.push(setHost(host));
  return host;
};

// pyvenv.cfg as each tool writes it (keys checked against real files: uv writes
// version_info, the standard library venv used by pipx writes version).
const UV_CFG = `home = /home/jane/.local/share/uv/python/cpython-3.12.8-linux-x86_64-gnu/bin${NL}implementation = CPython${NL}uv = 0.9.2${NL}version_info = 3.12.8${NL}include-system-site-packages = false${NL}`;
const VENV_CFG = `home = /opt/homebrew/opt/python@3.12/bin${NL}include-system-site-packages = false${NL}version = 3.12.11${NL}executable = /opt/homebrew/Cellar/python@3.12/3.12.11/bin/python3.12${NL}command = /opt/homebrew/opt/python@3.12/bin/python3.12 -m venv /Users/jane/.local/pipx/venvs/mistral-vibe${NL}`;

describe("requires_python specs (PEP 440)", () => {
  it.each([
    [">=3.14", "3.12.8", false],
    [">=3.14", "3.14.0", true],
    [">=3.10,<3.14", "3.12.8", true],
    [">=3.10,<3.14", "3.14.1", false],
    [">=3.10, <3.14", "3.9.18", false],
    ["~=3.10", "3.11.2", true],
    ["~=3.10", "4.0.0", false],
    ["==3.12.*", "3.12.4", true],
    ["!=3.13.*,>=3.10", "3.13.1", false],
    [">3.9", "3.9.1", true],
  ])("%s with Python %s -> %s", (spec, version, expected) => {
    expect(satisfiesSpec(spec, version)).toBe(expected);
  });

  it("can't read: empty, arbitrary equality, garbage -> null (no opinion)", () => {
    expect(satisfiesSpec("", "3.12.8")).toBeNull();
    expect(satisfiesSpec("===3.12.8", "3.12.8")).toBeNull();
    expect(satisfiesSpec("python3", "3.12.8")).toBeNull();
  });

  it("with only major.minor known (pip), decides only when every patch release agrees", () => {
    expect(pythonFits(">=3.14", "3.12")).toBe(false);
    expect(pythonFits(">=3.10,<3.14", "3.12")).toBe(true);
    expect(pythonFits(">=3.12.4", "3.12")).toBeNull();
  });

  it("suggests the closest fitting Python", () => {
    expect(suggestPython(">=3.14", "3.12.8")).toBe("3.14");
    expect(suggestPython(">=3.10,<3.14", "3.14.1")).toBe("3.13");
    expect(suggestPython(">=4", "3.12.8")).toBeNull();
  });
});

describe("the Python version of an install", () => {
  it("reads pyvenv.cfg: version_info (uv) or version (venv/pipx)", () => {
    expect(parsePyvenvVersion(UV_CFG)).toBe("3.12.8");
    expect(parsePyvenvVersion(VENV_CFG)).toBe("3.12.11");
    expect(parsePyvenvVersion(`home = /usr/bin${NL}`)).toBeNull();
    expect(parsePyvenvVersion(null)).toBeNull();
  });

  it("reads the site-packages path of pip installs on every OS", () => {
    expect(pythonVersionFromPath("/usr/lib/python3.12/site-packages")).toBe("3.12");
    expect(pythonVersionFromPath("/usr/lib/python3/dist-packages")).toBeNull(); // Debian's unversioned folder: unknown
    expect(pythonVersionFromPath("/Users/jane/Library/Python/3.13/lib/python/site-packages")).toBeNull();
    expect(pythonVersionFromPath(win("C:/Python312/Lib/site-packages"))).toBe("3.12");
    expect(pythonVersionFromPath(win("C:/Users/Jane/AppData/Roaming/Python/Python313/site-packages"))).toBe("3.13");
  });
});

describe("pythonCompatibility", () => {
  const lookup = (spec: string | null) => vi.fn(async () => spec);
  const uvLinux: PythonInstall = { kind: "uv", venv: "/home/jane/.local/share/uv/tools/mistral-vibe", sitePackages: "/home/jane/.local/share/uv/tools/mistral-vibe/lib/python3.12/site-packages", userSite: false };
  const pipxMac: PythonInstall = { kind: "pipx", venv: "/Users/jane/.local/pipx/venvs/mistral-vibe", sitePackages: "/Users/jane/.local/pipx/venvs/mistral-vibe/lib/python3.12/site-packages", userSite: false };
  const uvWinVenv = win("C:/Users/Jane/AppData/Roaming/uv/data/tools/mistral-vibe");
  const uvWin: PythonInstall = { kind: "uv", venv: uvWinVenv, sitePackages: win(`${uvWinVenv}/Lib/site-packages`), userSite: false };

  it("uv on Linux: Vibe 3.0 needs 3.14 -> manual `uv tool upgrade --python 3.14`", async () => {
    use(fakeHost({ platform: "linux", homedir: "/home/jane", texts: { [`${uvLinux.venv}/pyvenv.cfg`]: UV_CFG } }));
    const result = await pythonCompatibility(uvLinux, "mistral-vibe", "Mistral Vibe", "3.0.0", lookup(">=3.14"));
    expect(result?.message).toBe("Mistral Vibe 3.0.0 needs Python >=3.14; your install uses Python 3.12.");
    expect(result?.plan).toMatchObject({ kind: "manual", command: "uv tool upgrade --python 3.14 mistral-vibe" });
  });

  it("pipx on macOS -> manual `pipx reinstall --python 3.14`", async () => {
    use(fakeHost({ platform: "darwin", homedir: "/Users/jane", texts: { [`${pipxMac.venv}/pyvenv.cfg`]: VENV_CFG } }));
    const result = await pythonCompatibility(pipxMac, "mistral-vibe", "Mistral Vibe", "3.0.0", lookup(">=3.14"));
    expect(result?.plan).toMatchObject({ kind: "manual", command: "pipx reinstall --python 3.14 mistral-vibe" });
  });

  it("uv on Windows (Lib\\site-packages, version from pyvenv.cfg)", async () => {
    use(fakeHost({ platform: "win32", homedir: win("C:/Users/Jane"), texts: { [win(`${uvWinVenv}/pyvenv.cfg`)]: UV_CFG } }));
    const result = await pythonCompatibility(uvWin, "mistral-vibe", "Mistral Vibe", "3.0.0", lookup(">=3.14"));
    expect(result?.plan).toMatchObject({ command: "uv tool upgrade --python 3.14 mistral-vibe" });
  });

  it("too new a Python for an upper bound -> the newest older one", async () => {
    use(fakeHost({ platform: "linux", homedir: "/home/jane", texts: { [`${uvLinux.venv}/pyvenv.cfg`]: UV_CFG.replaceAll("3.12.8", "3.14.1") } }));
    const result = await pythonCompatibility(uvLinux, "aider-chat", "Aider", "0.90.0", lookup(">=3.10,<3.14"));
    expect(result?.plan).toMatchObject({ command: "uv tool upgrade --python 3.13 aider-chat" });
  });

  it("pip: the command plus a note that it depends on the user's setup", async () => {
    use(fakeHost({ platform: "linux", homedir: "/home/jane" }));
    const pip: PythonInstall = { kind: "pip", venv: null, sitePackages: "/home/jane/.local/lib/python3.12/site-packages", userSite: true };
    const result = await pythonCompatibility(pip, "mistral-vibe", "Mistral Vibe", "3.0.0", lookup(">=3.14"));
    expect(result?.plan).toMatchObject({ kind: "manual", command: "python3.14 -m pip install --upgrade --user mistral-vibe" });
    expect(result?.plan.kind === "manual" && result.plan.reason).toContain("pip installs depend on your own setup");
  });

  it("no opinion when it fits, or when requires_python or the Python version is unknown", async () => {
    use(fakeHost({ platform: "linux", homedir: "/home/jane", texts: { [`${uvLinux.venv}/pyvenv.cfg`]: UV_CFG } }));
    expect(await pythonCompatibility(uvLinux, "mistral-vibe", "Mistral Vibe", "2.27.0", lookup(">=3.10,<3.14"))).toBeNull();
    expect(await pythonCompatibility(uvLinux, "mistral-vibe", "Mistral Vibe", "3.0.0", lookup(null))).toBeNull();
    use(fakeHost({ platform: "linux", homedir: "/home/jane" })); // no pyvenv.cfg
    const noCfg = lookup(">=3.14");
    expect(await pythonCompatibility(uvLinux, "mistral-vibe", "Mistral Vibe", "3.0.0", noCfg)).toBeNull();
    expect(noCfg).not.toHaveBeenCalled(); // nothing is looked up without a known Python
  });
});

describe("a scan of Mistral Vibe 2.26.1 in a Python 3.12 uv environment, with 3.0.0 out", () => {
  it("shows update available, plans a manual reinstall, adds a note and never preselects it", async () => {
    const venv = "/home/jane/.local/share/uv/tools/mistral-vibe";
    use(
      fakeHost({
        platform: "linux",
        homedir: "/home/jane",
        env: { PATH: "/home/jane/.local/bin" },
        files: ["/home/jane/.local/bin/uv", `${venv}/bin/vibe`],
        texts: {
          [`${venv}/pyvenv.cfg`]: UV_CFG,
          [`${venv}/lib/python3.12/site-packages/mistral_vibe-2.26.1.dist-info/METADATA`]: `Name: mistral-vibe${NL}Version: 2.26.1${NL}`,
        },
      }),
    );
    primeNpmGlobalPaths(null);
    const fetch = vi.fn(async (url: string) => {
      if (url === "https://pypi.org/pypi/mistral-vibe/json") return Response.json({ info: { version: "3.0.0", requires_python: ">=3.14" } });
      if (url === "https://pypi.org/pypi/mistral-vibe/3.0.0/json") return Response.json({ info: { version: "3.0.0", requires_python: ">=3.14" } });
      return new Response("", { status: 404 });
    });
    restores.push(useFakeFetch(fetch));
    const active = { path: "/home/jane/.local/bin/vibe", realPath: `${venv}/bin/vibe`, installMethod: "uv" as const, version: "2.26.1" };
    const [scan] = await resolveLatest([{ tool: vibe, instances: [active] }], new LatestResolver(null));
    expect(scan).toMatchObject({
      state: "outdated",
      latestVersion: "3.0.0",
      compatibility: "Mistral Vibe 3.0.0 needs Python >=3.14; your install uses Python 3.12.",
      plan: { kind: "manual", command: "uv tool upgrade --python 3.14 mistral-vibe" },
    });
    expect(isOffered(scan!)).toBe(true);
    expect(initialSelection([scan!], {}).ids).toEqual([]);
    expect(initialSelection([scan!], { vibe: "update" }).ids).toEqual([]); // even when remembered
  });
});