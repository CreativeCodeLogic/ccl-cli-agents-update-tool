import { fetchJson, stringField } from "./http";

/** Latest release on PyPI, through the shared network layer (keep-alive, proxy, budget). */
export async function fetchLatestPypiVersion(pkg: string): Promise<string | null> {
  const doc = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`);
  return stringField((doc as { info?: unknown } | null)?.info, "version");
}