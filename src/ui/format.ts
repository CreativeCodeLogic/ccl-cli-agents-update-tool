/**
 * A build suffix: a commit hash, optionally preceded by a time (Cursor uses
 * 2026.10.01-e373342 and 2026.06.12-19-59-36-f6aba9a). Prerelease tags such as
 * "-beta.3" or "-preview.1" are not build suffixes and are kept.
 */
const BUILD_SUFFIX = /^(.+?)-((?:\d{2}-\d{2}-\d{2}-)?[0-9a-f]{7,})$/;
const MAX_DISPLAY_LENGTH = 12;

/** Shorter version for the table and checklist; --json keeps the full string. */
export function displayVersion(version: string): string {
  if (version.length <= MAX_DISPLAY_LENGTH) return version;
  return BUILD_SUFFIX.exec(version)?.[1] ?? version;
}