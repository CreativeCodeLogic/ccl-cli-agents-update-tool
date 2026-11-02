import { debug } from "./debug";
import { getNetwork, stringField } from "./http";
import { sideEffectsBlocked } from "./sandbox";

/**
 * Latest release of a GitHub repository, as a version ("v2.62.0" -> "2.62.0").
 *
 * Unauthenticated GitHub API calls are limited to 60 per hour per IP (shared
 * by everyone behind the same address, e.g. CI runners), so:
 * - an optional token from GITHUB_TOKEN, else GH_TOKEN, raises the limit. It is
 *   read from the environment only (never from other tools' config files), sent
 *   only to api.github.com, and never logged, cached or printed;
 * - one request per repository per run (the network layer de-duplicates by URL);
 * - GitHub-sourced versions are cached for 6 hours (npm/PyPI: 1 hour);
 * - on a rate limit the caller falls back to the stale cache (LatestResolver),
 *   and the run shows one info line (see githubRateLimitNotice).
 */
export const GITHUB_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Where the token comes from (never its value). */
export function githubTokenSource(env: Readonly<Record<string, string | undefined>> = process.env): "GITHUB_TOKEN" | "GH_TOKEN" | null {
  if (env.GITHUB_TOKEN?.trim()) return "GITHUB_TOKEN";
  if (env.GH_TOKEN?.trim()) return "GH_TOKEN";
  return null;
}

function authHeaders(env: Readonly<Record<string, string | undefined>> = process.env): Record<string, string> {
  const source = githubTokenSource(env);
  return source ? { authorization: `Bearer ${env[source]!.trim()}` } : {};
}

/** Headers for one api.github.com request: the JSON media type and the optional token (never logged). */
export function githubApiHeaders(env: Readonly<Record<string, string | undefined>> = process.env): Record<string, string> {
  return { accept: "application/vnd.github+json", ...authHeaders(env) };
}

let rateLimited: { resetAt: number | null } | null = null;
let notified = false;

/** The rate limit seen this run, if any (for the one-line notice and tests). */
export function githubRateLimit(): { resetAt: number | null } | null {
  return rateLimited;
}

/**
 * "GitHub rate limit reached; set GITHUB_TOKEN for higher limits (resets at 19:42)",
 * once per run, or null.
 */
export function githubRateLimitNotice(now: () => Date = () => new Date()): string | null {
  if (!rateLimited || notified) return null;
  notified = true;
  const reset = rateLimited.resetAt && rateLimited.resetAt > now().getTime() ? ` (resets at ${new Date(rateLimited.resetAt).toTimeString().slice(0, 5)})` : "";
  const advice = githubTokenSource() ? "" : "; set GITHUB_TOKEN for higher limits";
  return `GitHub rate limit reached${advice}${reset}`;
}

/** Tests: forget the rate-limit state. */
export function resetGithubState(): void {
  rateLimited = null;
  notified = false;
}

/** GET a GitHub API URL with the optional token; null on any failure (a rate limit is noted like for releases). */
export async function authorizedGithubGet(url: string): Promise<unknown> {
  if (sideEffectsBlocked()) return null;
  const result = await getNetwork().get(url, { accept: "application/vnd.github+json", ...authHeaders() });
  if (!result.ok) {
    if (result.failure.rateLimit) rateLimited ??= result.failure.rateLimit;
    debug(`GitHub API ${url}: ${result.failure.detail}`);
    return null;
  }
  return result.value;
}

export async function fetchLatestGithubRelease(repo: string, tagToVersion: (tag: string) => string | null = defaultTagVersion): Promise<string | null> {
  if (sideEffectsBlocked()) return null;
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const result = await getNetwork().get(url, { accept: "application/vnd.github+json", ...authHeaders() });
  if (!result.ok) {
    if (result.failure.rateLimit) {
      rateLimited ??= result.failure.rateLimit;
      debug(`GitHub API rate limit reached for ${repo} (${result.failure.detail}${githubTokenSource() ? ", with a token" : "; 60 requests/hour without a token"}): using the cached version if there is one`);
    }
    return null;
  }
  const tag = stringField(result.value, "tag_name");
  return tag ? tagToVersion(tag) : null;
}

/** "v2.62.0" / "2.62.0" -> "2.62.0"; anything that isn't a version -> null. */
export function defaultTagVersion(tag: string): string | null {
  const m = /^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(tag.trim());
  return m ? m[1]! : null;
}