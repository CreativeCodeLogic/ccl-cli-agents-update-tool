import { debug } from "./debug";

const TIMEOUT_MS = 5_000;
const ATTEMPTS = 2;

const cache = new Map<string, Promise<unknown>>();

async function fetchOnce(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * GET a JSON document: 5s timeout per attempt, one retry (cold DNS/TLS can
 * approach the timeout), cached per run. Resolves null on failure.
 */
export function fetchJson(url: string): Promise<unknown> {
  let pending = cache.get(url);
  if (!pending) {
    pending = (async () => {
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          return await fetchOnce(url);
        } catch (error) {
          debug(`GET ${url} failed (attempt ${attempt}): ${String(error)}`);
        }
      }
      return null;
    })();
    cache.set(url, pending);
  }
  return pending;
}

/** Read a string field from an unknown JSON value. */
export function stringField(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}
