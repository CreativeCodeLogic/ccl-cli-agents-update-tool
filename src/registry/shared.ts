import type { BinaryInstance, UpdatePlan } from "../types";
import { exec } from "../utils/exec";
import { getHost } from "../utils/host";
import { isVoltaPath } from "../utils/installMethod";
import { isInCurrentNpmGlobal } from "../utils/npm";
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
  const command = `npm install -g ${pkg}@latest`;
  if (await isInCurrentNpmGlobal(instance.path, instance.realPath)) {
    return { kind: "auto", command: command.split(" ") };
  }
  if (isVoltaPath(instance.path, getHost())) {
    return { kind: "manual", command: `volta install ${pkg}`, reason: "Managed by Volta; let Volta install the new version." };
  }
  return {
    kind: "manual",
    command,
    reason: "Installed under a different Node.js/npm prefix (version manager?); run this with that Node version active.",
  };
}

export const brewPlan = (token: string, cask = false): UpdatePlan => ({
  kind: "manual",
  command: `brew upgrade ${cask ? "--cask " : ""}${token}`,
  reason: "Installed with Homebrew; let brew manage the upgrade.",
});
