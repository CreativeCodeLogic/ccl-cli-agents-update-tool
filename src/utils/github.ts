import { debug } from "./debug";
import { getNetwork, stringField } from "./http";
import { sideEffectsBlocked } from "./sandbox";

/**
 * Latest release of a GitHub repository, as a version ("v2.62.0" -> "2.62.0").
 *
 * Unauthenticated GitHub API calls are limited to 60 per hour per IP, so:
 * one request per repository per run (the network layer de-duplicates by URL),
 * cached for an hour like every latest version, and on a rate-limit answer
 * (403/429) the caller falls back to the stale cache (LatestResolver);
 * CCL_CAUT_DEBUG says why.
 */
export async function fetchLatestGithubRelease(repo: string, tagToVersion: (tag: string) => string | null = defaultTagVersion): Promise<string | null> {
  if (sideEffectsBlocked()) return null;
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const result = await getNetwork().get(url);
  if (!result.ok) {
    if (result.failure.kind === "http" && /HTTP (403|429)/.test(result.failure.detail)) {
      debug(`GitHub API rate limit reached for ${repo} (${result.failure.detail}; 60 requests/hour without a token): using the cached version if there is one`);
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