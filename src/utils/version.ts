import semver from "semver";
import type { ToolState } from "../types";

const VERSION_RE = /\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?/;

/** Pull the first version-looking token out of arbitrary `--version` output. */
export function extractVersion(output: string): string | null {
  const match = VERSION_RE.exec(output);
  return match ? match[0] : null;
}

function normalize(version: string): string | null {
  return semver.valid(version) ?? semver.valid(semver.coerce(version, { includePrerelease: true }));
}

/**
 * Compare installed vs latest for an installed tool.
 * Anything missing or unparseable is "unknown", never a false "outdated".
 */
export function compareVersions(installed: string | null, latest: string | null): ToolState {
  if (!installed || !latest) return "unknown";
  const a = normalize(installed);
  const b = normalize(latest);
  if (!a || !b) return "unknown";
  return semver.lt(a, b) ? "outdated" : "up-to-date";
}
