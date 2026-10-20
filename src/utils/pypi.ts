import { fetchJson, stringField } from "./http";

/** Latest release on PyPI, through the shared network layer (keep-alive, proxy, budget). */
/** requires_python of one release (null when PyPI doesn't say). */
export async function fetchRequiresPython(pkg: string, version: string): Promise<string | null> {
  const doc = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/${encodeURIComponent(version)}/json`);
  return stringField((doc as { info?: unknown } | null)?.info, "requires_python")?.trim() || null;
}

export async function fetchLatestPypiVersion(pkg: string): Promise<string | null> {
  const doc = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`);
  return stringField((doc as { info?: unknown } | null)?.info, "version");
}