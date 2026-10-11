/**
 * A build suffix: a commit hash, optionally preceded by a time (Cursor uses
 * 2026.10.01-e373342 and 2026.06.12-19-59-36-f6aba9a; Amp uses git-describe style,
 * 0.0.1791734437-g42649e). Prerelease tags such as
 * "-beta.3" or "-preview.1" are not build suffixes and are kept.
 */
const BUILD_SUFFIX = /^(.+?)-((?:\d{2}-\d{2}-\d{2}-)?(?:[0-9a-f]{7,}|g[0-9a-f]{6,}))$/;
const MAX_DISPLAY_LENGTH = 12;

/** Shorter version for the table and checklist; --json keeps the full string. */
export function displayVersion(version: string): string {
  if (version.length <= MAX_DISPLAY_LENGTH) return version;
  return BUILD_SUFFIX.exec(version)?.[1] ?? version;
}

/** "9h", "45m", "3d": how long ago `iso` was, for "cached 9h ago". */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}