import type { InstallMethod } from "../types";
import { exec } from "../utils/exec";
import { classifyInstallPath } from "../utils/install-method";
import { extractVersion } from "../utils/version";
import { findExecutable } from "../utils/which";

/** Memoized PATH lookup + install-method classification for one tool. */
export interface Locator {
  binaryPath(): Promise<string | null>;
  installMethod(): Promise<InstallMethod | null>;
}

export function createLocator(
  binNames: string[],
  refine?: (method: InstallMethod, binPath: string) => InstallMethod,
): Locator {
  let path: Promise<string | null> | undefined;
  let method: Promise<InstallMethod | null> | undefined;

  const binaryPath = () => (path ??= Promise.resolve().then(() => findExecutable(binNames)));
  const installMethod = () =>
    (method ??= binaryPath().then(async (bin) => {
      if (!bin) return null;
      const detected = await classifyInstallPath(bin);
      return refine ? refine(detected, bin) : detected;
    }));

  return { binaryPath, installMethod };
}

/** Run `<bin> <args>` and extract a version from its output; null on any failure. */
export async function versionFromCommand(
  bin: string | null,
  args: string[] = ["--version"],
  timeoutMs?: number,
): Promise<string | null> {
  if (!bin) return null;
  const res = await exec(bin, args, timeoutMs);
  if (!res.ok) return null;
  return extractVersion(res.stdout) ?? extractVersion(res.stderr);
}

/** Paths used by vendor "native" installers (Claude Code, Kimi Code, ...). */
export function looksLikeUserLocalBin(binPath: string): boolean {
  return /[\\/]\.local[\\/]bin[\\/]/i.test(binPath);
}
