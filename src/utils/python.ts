import type { UpdatePlan } from "../types";
import { envVar, pathFor, type Host } from "./host";
import { isInside } from "./paths";

/*
 * Tools installed through Python package managers. Locations, as documented:
 *
 * uv (https://docs.astral.sh/uv/reference/storage/, "Tools"):
 *   tool environments: UV_TOOL_DIR, else $XDG_DATA_HOME/uv/tools or
 *   ~/.local/share/uv/tools (Unix), %APPDATA%\uv\data\tools (Windows);
 *   executables: UV_TOOL_BIN_DIR, else $XDG_BIN_HOME, $XDG_DATA_HOME/../bin,
 *   ~/.local/bin (Windows: %USERPROFILE%\.local\bin). On Windows uv copies
 *   launchers there, so the binary path alone looks like a native install.
 *   Older uv releases used %APPDATA%\uv\tools on Windows; it is checked too.
 * pipx (https://pipx.pypa.io/latest/reference/environment-variables/):
 *   PIPX_HOME, else ~/.local/share/pipx (Linux), ~/Library/Application
 *   Support/pipx (macOS), %LOCALAPPDATA%\pipx\pipx (Windows); a legacy
 *   ~/.local/pipx (any OS) or ~\pipx (Windows) is still used when it exists.
 *   Environments live in <home>/venvs/<pkg>; executables in PIPX_BIN_DIR
 *   (default ~/.local/bin).
 * pip: a Python's Scripts (Windows) or bin directory, confirmed by the
 *   package's *.dist-info folder in the matching site-packages.
 */

export type PythonInstallKind = "uv" | "pipx" | "pip";

export interface PythonInstall {
  kind: PythonInstallKind;
  /** The package's site-packages (where its dist-info lives). */
  sitePackages: string;
  /** uv/pipx: the tool's own virtual environment. */
  venv: string | null;
  /** pip: installed with --user (user site). */
  userSite: boolean;
}

/** Directories where uv keeps tool environments (one folder per package). */
export function uvToolDirs(host: Host): string[] {
  const path = pathFor(host.platform);
  const dirs = [envVar(host, "UV_TOOL_DIR")];
  if (host.platform === "win32") {
    const appData = envVar(host, "APPDATA");
    dirs.push(appData && path.join(appData, "uv", "data", "tools"), appData && path.join(appData, "uv", "tools"));
  } else {
    dirs.push(path.join(envVar(host, "XDG_DATA_HOME") ?? path.join(host.homedir, ".local", "share"), "uv", "tools"));
  }
  return unique(dirs, host);
}

/** pipx homes (their venvs/ folder holds one environment per package). */
export function pipxHomes(host: Host): string[] {
  const path = pathFor(host.platform);
  const home = host.homedir;
  const dirs = [envVar(host, "PIPX_HOME"), path.join(home, ".local", "pipx")];
  if (host.platform === "win32") {
    const local = envVar(host, "LOCALAPPDATA") ?? path.join(home, "AppData", "Local");
    dirs.push(path.join(home, "pipx"), path.join(local, "pipx", "pipx"));
  } else if (host.platform === "darwin") {
    dirs.push(path.join(home, "Library", "Application Support", "pipx"), path.join(home, ".local", "share", "pipx"));
  } else {
    dirs.push(path.join(envVar(host, "XDG_DATA_HOME") ?? path.join(home, ".local", "share"), "pipx"));
  }
  return unique(dirs, host);
}

function unique(dirs: (string | undefined | null | false | "")[], host: Host): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of dirs) {
    if (!dir) continue;
    const key = host.platform === "win32" ? dir.toLowerCase() : dir;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(dir);
    }
  }
  return out;
}

/** Where uv and pipx put tool executables: UV_TOOL_BIN_DIR, XDG_BIN_HOME, PIPX_BIN_DIR, ~/.local/bin. */
export function shimDirs(host: Host): string[] {
  const path = pathFor(host.platform);
  const xdgData = envVar(host, "XDG_DATA_HOME");
  return unique(
    [
      envVar(host, "UV_TOOL_BIN_DIR"),
      envVar(host, "XDG_BIN_HOME"),
      xdgData && path.join(xdgData, "..", "bin"),
      envVar(host, "PIPX_BIN_DIR"),
      path.join(host.homedir, ".local", "bin"),
    ],
    host,
  );
}

/** PyPI names compare after lowercasing and folding runs of - _ . (PEP 503); dist-info folders use "_". */
export const normalizePypiName = (name: string) => name.toLowerCase().replace(/[-_.]+/g, "_");

/** site-packages folders inside a Python prefix or virtual environment. */
function sitePackagesIn(prefix: string, host: Host): string[] {
  const path = pathFor(host.platform);
  if (host.platform === "win32") return [path.join(prefix, "Lib", "site-packages")];
  const lib = path.join(prefix, "lib");
  return host.fs
    .list(lib)
    .filter((name) => /^python3(\.\d+)?$/.test(name))
    .flatMap((name) => [path.join(lib, name, "site-packages"), path.join(lib, name, "dist-packages")]);
}

/** The package's dist-info folder in one of `dirs`, if installed there. */
export function findDistInfo(dirs: readonly string[], pypi: string, host: Host): { sitePackages: string; distInfo: string } | null {
  const path = pathFor(host.platform);
  const wanted = normalizePypiName(pypi);
  for (const dir of dirs) {
    for (const name of host.fs.list(dir)) {
      const m = /^(.+?)-[^-]+\.dist-info$/i.exec(name);
      if (m && normalizePypiName(m[1]!) === wanted) return { sitePackages: dir, distInfo: path.join(dir, name) };
    }
  }
  return null;
}

/** Version from the dist-info METADATA "Version:" line (no process spawn). */
export function distInfoVersion(sitePackages: string, pypi: string, host: Host): string | null {
  const found = findDistInfo([sitePackages], pypi, host);
  if (!found) return null;
  const metadata = host.fs.readText(pathFor(host.platform).join(found.distInfo, "METADATA"));
  const m = metadata && /^Version:\s*(\S+)/m.exec(metadata);
  return m ? m[1]! : null;
}

function venvInstall(kind: "uv" | "pipx", venv: string, pypi: string, host: Host): PythonInstall | null {
  const found = findDistInfo(sitePackagesIn(venv, host), pypi, host);
  return found ? { kind, sitePackages: found.sitePackages, venv, userSite: false } : null;
}

/**
 * site-packages that a pip-installed script in `binDir` belongs to:
 * <prefix>/Scripts -> <prefix>/Lib/site-packages (Windows, incl. the user site
 * %APPDATA%\Python\Python3XX\Scripts -> ...\Python3XX\site-packages);
 * <prefix>/bin -> <prefix>/lib/python3.X/{site,dist}-packages (POSIX, incl.
 * ~/.local and macOS ~/Library/Python/3.X/lib/python/site-packages).
 */
function pipSiteCandidates(binDir: string, host: Host): { dirs: string[]; userSite: boolean } {
  const path = pathFor(host.platform);
  const prefix = path.dirname(binDir);
  if (host.platform === "win32") {
    const appData = envVar(host, "APPDATA");
    const userSite = Boolean(appData && isInside(binDir, path.join(appData, "Python"), host.platform));
    return { dirs: [path.join(prefix, "Lib", "site-packages"), path.join(prefix, "site-packages")], userSite };
  }
  const userSite = isInside(binDir, path.join(host.homedir, ".local"), host.platform) || isInside(binDir, path.join(host.homedir, "Library", "Python"), host.platform);
  return { dirs: [...sitePackagesIn(prefix, host), path.join(prefix, "lib", "python", "site-packages")], userSite };
}

/**
 * How a Python tool was installed, from where its binary lives (and, for
 * shims and uv's Windows launchers, which tool environment holds the package).
 * Pure: everything comes from `host`. null = not a Python package install.
 */
export function detectPythonInstall(binPath: string, realPath: string, pypi: string, host: Host): PythonInstall | null {
  const path = pathFor(host.platform);
  const folders = (roots: string[], sub: string[] = []) => roots.map((root) => path.join(root, ...sub));
  const venvRoots: { kind: "uv" | "pipx"; dir: string }[] = [
    ...folders(uvToolDirs(host)).map((dir) => ({ kind: "uv" as const, dir })),
    ...folders(pipxHomes(host), ["venvs"]).map((dir) => ({ kind: "pipx" as const, dir })),
  ];
  // uv and pipx name the environment after the package (uv normalizes it to lowercase with dashes).
  const names = [...new Set([pypi, pypi.toLowerCase(), normalizePypiName(pypi).replace(/_/g, "-")])];

  // 1. The binary (or its symlink target) lives inside a tool environment.
  for (const { kind, dir } of venvRoots) {
    for (const name of names) {
      const venv = path.join(dir, name);
      if (isInside(realPath, venv, host.platform) || isInside(binPath, venv, host.platform)) {
        return venvInstall(kind, venv, pypi, host);
      }
    }
  }
  // 2. A shim/launcher in a documented shim folder (e.g. ~/.local/bin; uv copies
  //    launchers there on Windows) whose tool environment has the same executable.
  //    Anywhere else, an unrelated binary with the same name must not be claimed.
  if (shimDirs(host).some((dir) => isInside(binPath, dir, host.platform))) {
    const exe = path.basename(binPath);
    for (const { kind, dir } of venvRoots) {
      for (const name of names) {
        const venv = path.join(dir, name);
        const venvExe = host.platform === "win32" ? path.join(venv, "Scripts", exe) : path.join(venv, "bin", exe);
        if (!host.fs.exists(venvExe)) continue;
        const install = venvInstall(kind, venv, pypi, host);
        if (install) return install;
      }
    }
  }
  // 3. pip: a scripts directory whose site-packages has the package's dist-info.
  const { dirs, userSite } = pipSiteCandidates(path.dirname(realPath), host);
  const found = findDistInfo(dirs, pypi, host) ?? findDistInfo(pipSiteCandidates(path.dirname(binPath), host).dirs, pypi, host);
  return found ? { kind: "pip", sitePackages: found.sitePackages, venv: null, userSite } : null;
}

/**
 * uv and pipx upgrade their own environments safely, so those run
 * automatically (when uv/pipx is on PATH). pip is always a command to copy:
 * system and externally-managed Pythons (PEP 668) make an automatic
 * `pip install --upgrade` unsafe.
 */
export function pythonUpdatePlan(install: PythonInstall, pypi: string, managerOnPath: boolean): UpdatePlan {
  if (install.kind === "pip") {
    return {
      kind: "manual",
      command: `python -m pip install --upgrade ${install.userSite ? "--user " : ""}${pypi}`,
      reason: "Installed with pip. System and externally-managed Pythons (PEP 668) make automatic pip upgrades unsafe; run this with the Python it was installed with.",
    };
  }
  const command = install.kind === "uv" ? ["uv", "tool", "upgrade", pypi] : ["pipx", "upgrade", pypi];
  if (managerOnPath) return { kind: "auto", command };
  return {
    kind: "manual",
    command: command.join(" "),
    reason: `Installed with ${install.kind}, but ${install.kind} isn't on PATH; run this where ${install.kind} is available.`,
  };
}