import { existsSync, readFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import pc from "./ui/colors";
import { fetch as undiciFetch, type Dispatcher } from "undici";
import { cacheDir } from "./utils/cache";
import { configDir } from "./utils/config";
import { getHost, pathFor } from "./utils/host";
import { githubTokenSource } from "./utils/github";
import { classifyError, createDispatcher, proxySettings, redactProxy, type NetFailure } from "./utils/http";
import { formatAgo } from "./ui/format";
import { icons } from "./ui/symbols";

/** Every host ccl-caut reads latest versions from, with a cheap URL to probe. */
export const VERSION_HOSTS = [
  { host: "registry.npmjs.org", url: "https://registry.npmjs.org/-/ping", usedFor: "npm packages, Amp, ccl-caut itself" },
  { host: "api.github.com", url: "https://api.github.com/zen", usedFor: "Antigravity, Supabase, GitHub CLI, Goose, winget versions" },
  { host: "dl.google.com", url: "https://dl.google.com/dl/cloudsdk/channels/rapid/components-2.json", usedFor: "Google Cloud CLI" },
  { host: "pypi.org", url: "https://pypi.org/pypi/aider-chat/json", usedFor: "Aider, Mistral Vibe, legacy kimi-cli" },
  { host: "prod.download.cli.kiro.dev", url: "https://prod.download.cli.kiro.dev/stable/latest/manifest.json", usedFor: "Kiro CLI" },
] as const;

const PROBE_TIMEOUT_MS = 8_000;

export interface ProbeResult {
  host: string;
  usedFor: string;
  /** DNS from this machine (with a proxy, the proxy resolves names instead). */
  dns: { ok: true; ms: number; address: string } | { ok: false; failure: NetFailure };
  https: { ok: true; ms: number; status: number } | { ok: false; ms: number; failure: NetFailure };
}

export interface DoctorDeps {
  resolve(host: string): Promise<{ address: string }>;
  head(url: string, timeoutMs: number): Promise<{ status: number }>;
  now(): number;
  env: Readonly<Record<string, string | undefined>>;
}

export function realDoctorDeps(): DoctorDeps {
  let dispatcher: Dispatcher | null = null;
  return {
    resolve: (host) => lookup(host),
    async head(url, timeoutMs) {
      dispatcher ??= createDispatcher();
      const res = await undiciFetch(url, {
        method: "HEAD",
        headers: { "user-agent": "ccl-caut doctor (+https://creativecodelogic.com)" },
        signal: AbortSignal.timeout(timeoutMs),
        dispatcher,
      });
      return { status: res.status };
    },
    now: () => performance.now(),
    env: process.env,
  };
}

async function probe(target: (typeof VERSION_HOSTS)[number], deps: DoctorDeps): Promise<ProbeResult> {
  const timed = async <T>(fn: () => Promise<T>) => {
    const start = deps.now();
    try {
      return { ok: true as const, value: await fn(), ms: Math.round(deps.now() - start) };
    } catch (error) {
      return { ok: false as const, error, ms: Math.round(deps.now() - start) };
    }
  };
  const [dns, https] = await Promise.all([timed(() => deps.resolve(target.host)), timed(() => deps.head(target.url, PROBE_TIMEOUT_MS))]);
  return {
    host: target.host,
    usedFor: target.usedFor,
    dns: dns.ok ? { ok: true, ms: dns.ms, address: dns.value.address } : { ok: false, failure: classifyError(dns.error) },
    https: https.ok
      ? { ok: true, ms: https.ms, status: https.value.status }
      : { ok: false, ms: https.ms, failure: classifyError(https.error, PROBE_TIMEOUT_MS) },
  };
}

/** Any HTTP answer means the server is reachable (HEAD may get 405 or 403). */
const reachable = (r: ProbeResult) => r.https.ok && r.https.status < 500;

function describeCache(): string {
  const dir = cacheDir();
  if (!dir) return "no cache folder (no home directory)";
  const file = pathFor(getHost().platform).join(dir, "latest-versions.json");
  if (!existsSync(file)) return `${file} (not created yet)`;
  try {
    const entries = Object.values((JSON.parse(readFileSync(file, "utf8")) as { entries?: Record<string, { fetchedAt?: number }> }).entries ?? {});
    const newest = Math.max(...entries.map((e) => e.fetchedAt ?? 0));
    const age = entries.length > 0 && newest > 0 ? `, newest ${formatAgo(new Date(newest).toISOString())} ago` : "";
    return `${file} (${entries.length} entries${age})`;
  } catch {
    return `${file} (unreadable; it will be rebuilt)`;
  }
}

function describeConfig(): string {
  const dir = configDir();
  if (!dir) return "no config folder (no home directory)";
  const file = pathFor(getHost().platform).join(dir, "config.json");
  return existsSync(file) ? file : `${file} (not created yet)`;
}

/** The --doctor report as lines, and its exit code (1 when any version host is unreachable). */
export async function doctorReport(version: string, deps: DoctorDeps = realDoctorDeps()): Promise<{ lines: string[]; code: number }> {
  const results = await Promise.all(VERSION_HOSTS.map((t) => probe(t, deps)));
  const proxy = proxySettings(deps.env);
  const width = Math.max(...results.map((r) => r.host.length));
  const lines = [`ccl-caut ${version} doctor · Node ${process.version} · ${process.platform} ${process.arch}`, "", pc.bold("Version servers")];
  for (const r of results) {
    const dns = r.dns.ok ? `DNS ${r.dns.ms}ms` : `DNS failed (${r.dns.failure.detail})`;
    const https = r.https.ok
      ? `HTTPS ${r.https.status} in ${r.https.ms}ms`
      : `${r.https.failure.kind === "timeout" ? "timeout" : r.https.failure.kind === "dns" ? "DNS error" : r.https.failure.kind} (${r.https.failure.detail})`;
    const icon = reachable(r) ? pc.green(icons.ok) : pc.red(icons.fail);
    const verdict = reachable(r) ? pc.green("reachable") : pc.red("unreachable");
    lines.push(`  ${icon} ${r.host.padEnd(width)}  ${verdict} · ${dns} · ${https}  ${pc.dim(`(${r.usedFor})`)}`);
  }
  const usingProxy = Boolean(proxy.httpsProxy || proxy.httpProxy);
  lines.push(
    "",
    pc.bold("Proxy"),
    `  HTTPS_PROXY  ${redactProxy(proxy.httpsProxy) ?? pc.dim("(not set)")}`,
    `  HTTP_PROXY   ${redactProxy(proxy.httpProxy) ?? pc.dim("(not set)")}`,
    `  NO_PROXY     ${proxy.noProxy ?? pc.dim("(not set)")}`,
    `  ${pc.dim(usingProxy ? "ccl-caut sends its lookups through this proxy (DNS above is this machine's own)." : "No proxy: lookups connect directly.")}`,
    "",
    pc.bold("GitHub API"),
    // Only where the token comes from, never its value.
    `  token  ${githubTokenSource(deps.env) ? `set (${githubTokenSource(deps.env)})` : pc.dim("not set (60 requests/hour per IP; set GITHUB_TOKEN for more)")}`,
    "",
    pc.bold("Files"),
    `  cache   ${describeCache()}`,
    `  config  ${describeConfig()}`,
  );
  const down = results.filter((r) => !reachable(r));
  lines.push(
    "",
    down.length === 0
      ? pc.green("All version servers are reachable.")
      : pc.yellow(`${down.length} of ${results.length} version servers unreachable: ${down.map((r) => r.host).join(", ")}.`),
  );
  return { lines, code: down.length === 0 ? 0 : 1 };
}