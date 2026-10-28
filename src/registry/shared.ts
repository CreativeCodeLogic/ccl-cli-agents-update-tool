import type { BinaryInstance, UpdatePlan } from "../types";
import { exec } from "../utils/exec";
import { getHost } from "../utils/host";
import { isVoltaPath } from "../utils/installMethod";
import { isInCurrentNpmGlobal } from "../utils/npm";
import { getNpmScriptPolicy, NPM_SCRIPT_NEEDED, npmScriptArgs } from "../utils/npm-scripts";
import { extractVersion } from "../utils/version";

/** Run `<bin> <args>` and extract a version from its output; null on any failure. */
export async function versionFromCommand(
  bin: string,
  args: string[] = ["--version"],
  timeoutMs?: number,
): Promise<string | null> {
  const res = await exec(bin, args, timeoutMs);
  if (!res.ok) return null;
  return extractVersion(res.stdout) ?? extractVersion(res.stderr);
}

/**
 * Plan for an npm-installed copy: auto only when `npm install -g` (with the
 * npm on PATH) replaces this exact copy. Returns null for non-npm installs.
 */
export async function npmGlobalPlan(instance: BinaryInstance, pkg: string): Promise<UpdatePlan | null> {
  if (instance.installMethod !== "npm") return null;
  if (await isInCurrentNpmGlobal(instance.path, instance.realPath)) return npmInstallPlan(pkg, "latest");
  if (isVoltaPath(instance.path, getHost())) {
    return { kind: "manual", command: `volta install ${pkg}`, reason: "Managed by Volta; let Volta install the new version." };
  }
  // That npm's version is unknown here: the flag would only be a warning before npm 11.16.
  const scripts = NPM_SCRIPT_NEEDED[pkg] ? ` On npm 12 or later add --allow-scripts=${pkg} (its install script ${NPM_SCRIPT_NEEDED[pkg]}).` : "";
  return {
    kind: "manual",
    command: `npm install -g ${pkg}@latest`,
    reason: `Installed under a different Node.js/npm prefix (version manager?); run this with that Node version active.${scripts}`,
  };
}

/**
 * `npm install -g <pkg>@<spec>` with the npm on PATH, as an automatic plan: with
 * --allow-scripts when npm would block the package's own install script, or a
 * manual plan when the user turned install scripts off (never overridden).
 */
export async function npmInstallPlan(pkg: string, spec: string): Promise<UpdatePlan> {
  const scripts = npmScriptArgs(pkg, spec, await getNpmScriptPolicy());
  if (scripts.kind === "denied") return { kind: "manual", command: scripts.command, reason: scripts.reason };
  return { kind: "auto", command: ["npm", "install", "-g", ...scripts.args, `${pkg}@${spec}`] };
}

export const brewPlan = (token: string, cask = false): UpdatePlan => ({
  kind: "manual",
  command: `brew upgrade ${cask ? "--cask " : ""}${token}`,
  reason: "Installed with Homebrew; let brew manage the upgrade.",
});
