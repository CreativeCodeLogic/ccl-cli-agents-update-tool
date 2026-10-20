import type { UpdatePlan } from "../types";
import { pathFor, type Host } from "./host";
import type { PythonInstall } from "./python";

/*
 * Whether a Python tool's latest release can run on the Python its install
 * uses. A newer release can require a newer Python (Mistral Vibe 3.0 needs
 * 3.14+): `uv tool upgrade` / `pipx upgrade` then keep the old version, and
 * the update would report "unchanged" on every run. When both versions are
 * known and don't match, the update becomes a manual reinstall with a fitting
 * Python. Anything unknown: no opinion (null), never a guess.
 */

/** Release segment of a version ("3.12.8" -> [3, 12, 8]); null for anything else (pre-releases, local tags). */
function release(version: string): number[] | null {
  const m = /^v?(\d+(?:\.\d+)*)$/.exec(version.trim());
  return m ? m[1]!.split(".").map(Number) : null;
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

const startsWith = (actual: readonly number[], prefix: readonly number[]) => prefix.every((n, i) => (actual[i] ?? 0) === n);

/** One PEP 440 clause ("<3.14", "~=3.10", "==3.12.*"); null when it can't be read. */
function clause(text: string, actual: readonly number[]): boolean | null {
  const m = /^(~=|===|==|!=|<=|>=|<|>)\s*(\S+)$/.exec(text);
  if (!m) return null;
  const [, op, raw] = m as unknown as [string, string, string];
  if (op === "===") return null;
  if ((op === "==" || op === "!=") && raw.endsWith(".*")) {
    const prefix = release(raw.slice(0, -2));
    if (!prefix) return null;
    return op === "==" ? startsWith(actual, prefix) : !startsWith(actual, prefix);
  }
  const wanted = release(raw);
  if (!wanted) return null;
  const c = compare(actual, wanted);
  switch (op) {
    case ">=":
      return c >= 0;
    case ">":
      return c > 0;
    case "<=":
      return c <= 0;
    case "<":
      return c < 0;
    case "==":
      return c === 0;
    case "!=":
      return c !== 0;
    default: // "~=": >= wanted, and the same release up to the last given part
      return wanted.length >= 2 && c >= 0 && startsWith(actual, wanted.slice(0, -1));
  }
}

/** Whether `version` satisfies a requires_python spec (e.g. ">=3.10,<3.14"); null when the spec can't be read. */
export function satisfiesSpec(spec: string, version: string): boolean | null {
  const actual = release(version);
  const clauses = spec.split(",").map((s) => s.trim()).filter(Boolean);
  if (!actual || clauses.length === 0) return null;
  let ok = true;
  for (const c of clauses) {
    const result = clause(c, actual);
    if (result === null) return null;
    ok &&= result;
  }
  return ok;
}

/**
 * Whether an environment's Python fits the spec. With only "major.minor" known
 * (pip installs), the answer must hold for every patch release, else null.
 */
export function pythonFits(spec: string, envVersion: string): boolean | null {
  if (envVersion.split(".").length >= 3) return satisfiesSpec(spec, envVersion);
  const first = satisfiesSpec(spec, `${envVersion}.0`);
  return first === satisfiesSpec(spec, `${envVersion}.99`) ? first : null;
}

/**
 * The Python minor version to reinstall with: the closest one (newest patch)
 * that fits, the next newer one when the environment is too old, otherwise the
 * newest older one. null when no 3.x fits.
 */
export function suggestPython(spec: string, envVersion: string): string | null {
  const current = release(envVersion)?.[1];
  if (current === undefined) return null;
  const fitting: number[] = [];
  for (let minor = 6; minor <= 40; minor++) if (satisfiesSpec(spec, `3.${minor}.99`)) fitting.push(minor);
  const newer = fitting.find((m) => m > current);
  const pick = newer ?? fitting.filter((m) => m < current).at(-1);
  return pick === undefined ? null : `3.${pick}`;
}

/**
 * The Python version of an install: `version_info` (uv, virtualenv) or
 * `version` (the standard library's venv, which pipx uses) in the
 * environment's pyvenv.cfg; for pip, the version in the site-packages path
 * (lib/python3.12/site-packages, Python312\Lib\site-packages).
 */
export function pythonVersionOf(install: PythonInstall, host: Host): string | null {
  if (install.venv) return parsePyvenvVersion(host.fs.readText(pathFor(host.platform).join(install.venv, "pyvenv.cfg")));
  return pythonVersionFromPath(install.sitePackages);
}

export function parsePyvenvVersion(text: string | null): string | null {
  if (!text) return null;
  for (const key of ["version_info", "version"]) {
    const m = new RegExp(`^\\s*${key}\\s*=\\s*(\\d+\\.\\d+(?:\\.\\d+)?)`, "m").exec(text);
    if (m) return m[1]!;
  }
  return null;
}

export function pythonVersionFromPath(sitePackages: string): string | null {
  const unix = /[\\/]lib[\\/]python(\d)\.(\d+)[\\/](?:site|dist)-packages$/i.exec(sitePackages);
  if (unix) return `${unix[1]}.${unix[2]}`;
  const win = /[\\/]Python(\d)(\d{1,2})(?:-32|-arm64)?[\\/](?:Lib[\\/])?site-packages$/i.exec(sitePackages);
  return win ? `${win[1]}.${win[2]}` : null;
}

const minorOf = (version: string) => version.split(".").slice(0, 2).join(".");

/** The manual plan when the latest release needs another Python (commands per the uv and pipx docs). */
export function reinstallWithPython(
  install: PythonInstall,
  pypi: string,
  { toolName, latest, spec, envVersion, target, platform }: { toolName: string; latest: string; spec: string; envVersion: string; target: string; platform: NodeJS.Platform },
): { message: string; plan: UpdatePlan } {
  const message = `${toolName} ${latest} needs Python ${spec}; your install uses Python ${minorOf(envVersion)}.`;
  if (install.kind === "uv") {
    // https://docs.astral.sh/uv/reference/cli/#uv-tool-upgrade--python
    return {
      message,
      plan: { kind: "manual", command: `uv tool upgrade --python ${target} ${pypi}`, reason: `${message} This rebuilds its uv tool environment with Python ${target} (uv downloads it if needed).` },
    };
  }
  if (install.kind === "pipx") {
    // https://pipx.pypa.io/stable/how-to/manage-installed-apps.html ("Reinstall one": pass --python)
    return {
      message,
      plan: { kind: "manual", command: `pipx reinstall --python ${target} ${pypi}`, reason: `${message} This rebuilds its pipx environment with Python ${target}, keeping the original install options; that Python must be installed.` },
    };
  }
  const python = platform === "win32" ? `py -${target}` : `python${target}`;
  return {
    message,
    plan: {
      kind: "manual",
      command: `${python} -m pip install --upgrade ${install.userSite ? "--user " : ""}${pypi}`,
      reason: `${message} pip installs depend on your own setup: install it with a Python that matches ${spec} (this command assumes Python ${target}).`,
    },
  };
}