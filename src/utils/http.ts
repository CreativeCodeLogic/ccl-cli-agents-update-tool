import { Agent, fetch as undiciFetch, ProxyAgent, type Dispatcher } from "undici";
import { debug } from "./debug";
import { sideEffectsBlocked } from "./sandbox";

/**
 * Latest-version lookups share one keep-alive dispatcher (a few connections per
 * host instead of one TCP+TLS handshake and DNS lookup per request), honor
 * HTTPS_PROXY / HTTP_PROXY / NO_PROXY, and run inside one time budget:
 *
 * - warm-up: one tiny request to registry.npmjs.org first (DNS + TLS + a pooled
 *   connection), so a cold network (machine just woke) isn't hit by 12 handshakes at once;
 * - attempt 1: 8s when the warm-up didn't succeed (cold start), else 5s;
 * - attempt 2: 5s, network errors and HTTP 5xx/429 only;
 * - nothing runs past LOOKUP_BUDGET_MS (~14s) after the lookups started.
 */
export const WARMUP_URL = "https://registry.npmjs.org/-/ping";
export const WARMUP_TIMEOUT_MS = 6_000;
export const COLD_TIMEOUT_MS = 8_000;
export const WARM_TIMEOUT_MS = 5_000;
export const RETRY_TIMEOUT_MS = 5_000;
export const LOOKUP_BUDGET_MS = 14_000;
const MIN_ATTEMPT_MS = 1_000;
const USER_AGENT = "ccl-caut (+https://creativecodelogic.com)";

export type NetFailureKind = "timeout" | "dns" | "offline" | "proxy" | "tls" | "http" | "connection";

export interface NetFailure {
  kind: NetFailureKind;
  /** e.g. "ENOTFOUND registry.npmjs.org", "HTTP 503", "timed out after 8.0s" */
  detail: string;
}

export type FetchResult = { ok: true; value: unknown } | { ok: false; failure: NetFailure };

export type FetchImpl = (url: string, init: { headers: Record<string, string>; signal: AbortSignal; dispatcher?: Dispatcher }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface ProxySettings {
  httpsProxy: string | null;
  httpProxy: string | null;
  noProxy: string | null;
}

/** Proxy variables as curl and npm read them (upper or lower case). */
export function proxySettings(env: Readonly<Record<string, string | undefined>> = process.env): ProxySettings {
  const pick = (name: string) => env[name] || env[name.toLowerCase()] || null;
  return { httpsProxy: pick("HTTPS_PROXY"), httpProxy: pick("HTTP_PROXY"), noProxy: pick("NO_PROXY") };
}

/** A proxy URL safe to print: credentials hidden. */
export function redactProxy(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "";
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return "(unparseable)";
  }
}

/**
 * NO_PROXY as curl reads it: comma- or space-separated hosts, "*" for all,
 * a leading "." or "*." matching subdomains, an optional ":port".
 */
export function bypassesProxy(url: string, noProxy: string | null): boolean {
  if (!noProxy) return false;
  const { hostname, port, protocol } = new URL(url);
  const host = hostname.toLowerCase();
  const effectivePort = port || (protocol === "https:" ? "443" : "80");
  return noProxy
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((raw) => {
      if (raw === "*") return true;
      const [name = "", entryPort] = raw.toLowerCase().split(":");
      if (entryPort && entryPort !== effectivePort) return false;
      const bare = name.replace(/^\*?\./, "");
      return host === bare || host.endsWith(`.${bare}`);
    });
}

/** The proxy for `url` (HTTPS_PROXY, falling back to HTTP_PROXY like npm), or null to connect directly. */
export function proxyFor(url: string, proxy: ProxySettings): string | null {
  if (bypassesProxy(url, proxy.noProxy)) return null;
  return url.startsWith("https:") ? (proxy.httpsProxy ?? proxy.httpProxy) : proxy.httpProxy;
}

/**
 * A keep-alive pool (4 connections per host), sent through the proxy from the
 * environment unless NO_PROXY says otherwise.
 */
export function createDispatcher(proxy: ProxySettings = proxySettings()): Dispatcher {
  const pool = { connections: 4, keepAliveTimeout: 10_000, keepAliveMaxTimeout: 30_000 };
  const direct = new Agent(pool);
  if (!proxy.httpsProxy && !proxy.httpProxy) return direct;
  const viaProxy = new Map<string, ProxyAgent>();
  // Route each request by its origin; a Dispatcher only needs dispatch().
  const router = Object.create(direct) as Dispatcher;
  router.dispatch = (options, handler) => {
    const uri = proxyFor(String(options.origin), proxy);
    if (!uri) return direct.dispatch(options, handler);
    let agent = viaProxy.get(uri);
    if (!agent) {
      agent = new ProxyAgent({ uri, ...pool });
      viaProxy.set(uri, agent);
    }
    return agent.dispatch(options, handler);
  };
  return router;
}

const DNS_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL", "EAI_NODATA", "EAI_NONAME"]);
const OFFLINE_CODES = new Set(["ENETUNREACH", "EHOSTUNREACH", "ENETDOWN", "EADDRNOTAVAIL"]);
const TIMEOUT_CODES = new Set(["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);

/** Turn a fetch error into a kind a person can act on. */
export function classifyError(error: unknown, timeoutMs?: number): NetFailure {
  const chain: { name?: string; code?: string; message?: string }[] = [];
  let e: unknown = error;
  for (let i = 0; e && typeof e === "object" && i < 5; i++) {
    chain.push(e as { name?: string; code?: string; message?: string });
    e = (e as { cause?: unknown }).cause;
  }
  const seconds = timeoutMs ? ` after ${(timeoutMs / 1000).toFixed(1)}s` : "";
  for (const c of chain) {
    const code = c.code ?? "";
    const message = c.message ?? "";
    // Checked first: undici reports a refused CONNECT tunnel as an AbortError ("Proxy response (407) !== 200 ...").
    const proxyStatus = /Proxy response \((\d{3})\)/.exec(message)?.[1];
    if (proxyStatus) {
      return { kind: "proxy", detail: proxyStatus === "407" ? "proxy answered 407: authentication required" : `proxy answered ${proxyStatus}` };
    }
    if (/proxy/i.test(message)) return { kind: "proxy", detail: message };
    // AbortSignal.timeout() aborts with a TimeoutError; other aborts are not timeouts.
    if (c.name === "TimeoutError" || TIMEOUT_CODES.has(code)) return { kind: "timeout", detail: `timed out${seconds}` };
    if (DNS_CODES.has(code)) return { kind: "dns", detail: `${code}${(c as { hostname?: string }).hostname ? ` ${(c as { hostname?: string }).hostname}` : ""}` };
    if (OFFLINE_CODES.has(code)) return { kind: "offline", detail: code };
    if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/i.test(code)) return { kind: "tls", detail: code };
  }
  const last = chain[chain.length - 1];
  return { kind: "connection", detail: last?.code || last?.message || String(error) };
}

const retryable = (f: NetFailure) => f.kind !== "http" || /HTTP (5\d\d|429)/.test(f.detail);

/** One run's network state: dispatcher, warm-up, budget, per-URL results. */
export class Network {
  private readonly results = new Map<string, Promise<FetchResult>>();
  private readonly outcomes = new Map<string, FetchResult>();
  private warm: Promise<boolean> | null = null;
  private deadline: number | null = null;
  private dispatcherInstance: Dispatcher | null = null;

  private readonly fetchImpl: FetchImpl;
  private readonly now: () => number;
  private readonly makeDispatcher: () => Dispatcher | undefined;
  private readonly warmUpUrl: string | null;
  private readonly timeout: (ms: number) => AbortSignal;

  constructor(
    options: {
      fetch?: FetchImpl;
      now?: () => number;
      dispatcher?: () => Dispatcher | undefined;
      warmUpUrl?: string | null;
      /** Abort signal for one attempt (tests use a fake clock). */
      timeout?: (ms: number) => AbortSignal;
    } = {},
  ) {
    this.fetchImpl = options.fetch ?? (undiciFetch as unknown as FetchImpl);
    this.now = options.now ?? Date.now;
    this.timeout = options.timeout ?? ((ms) => AbortSignal.timeout(ms));
    this.makeDispatcher = options.dispatcher ?? (() => createDispatcher());
    this.warmUpUrl = options.warmUpUrl === undefined ? WARMUP_URL : options.warmUpUrl;
  }

  private get dispatcher(): Dispatcher | undefined {
    this.dispatcherInstance ??= this.makeDispatcher() ?? null;
    return this.dispatcherInstance ?? undefined;
  }

  private async fetchOnce(url: string, timeoutMs: number): Promise<FetchResult> {
    try {
      const dispatcher = this.dispatcher;
      const res = await this.fetchImpl(url, {
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        signal: this.timeout(timeoutMs),
        ...(dispatcher && { dispatcher }),
      });
      if (!res.ok) return { ok: false, failure: { kind: "http", detail: `HTTP ${res.status}` } };
      return { ok: true, value: await res.json() };
    } catch (error) {
      return { ok: false, failure: classifyError(error, timeoutMs) };
    }
  }

  /** Start the lookup clock and the warm-up (idempotent). Resolves true when the network answered. */
  warmUp(): Promise<boolean> {
    this.deadline ??= this.now() + LOOKUP_BUDGET_MS;
    const url = this.warmUpUrl;
    this.warm ??= url
      ? this.fetchOnce(url, WARMUP_TIMEOUT_MS).then((r) => {
          if (!r.ok) debug(`warm-up ${url} failed: ${r.failure.kind} (${r.failure.detail})`);
          return r.ok;
        })
      : Promise.resolve(true);
    return this.warm;
  }

  private async lookup(url: string): Promise<FetchResult> {
    const warm = await this.warmUp();
    // Lookups started inside the window share its deadline; a later one gets a window of its own.
    const now = this.now();
    const deadline = this.deadline !== null && this.deadline > now ? this.deadline : now + LOOKUP_BUDGET_MS;
    const timeouts = [warm ? WARM_TIMEOUT_MS : COLD_TIMEOUT_MS, RETRY_TIMEOUT_MS];
    let last: FetchResult = { ok: false, failure: { kind: "timeout", detail: "no time left" } };
    for (let attempt = 0; attempt < timeouts.length; attempt++) {
      const left = deadline - this.now();
      if (left < MIN_ATTEMPT_MS) break;
      last = await this.fetchOnce(url, Math.min(timeouts[attempt]!, left));
      if (last.ok) return last;
      debug(`GET ${url} failed (attempt ${attempt + 1}): ${last.failure.kind} (${last.failure.detail})`);
      if (!retryable(last.failure)) break;
    }
    return last;
  }

  /** GET a JSON document once per run (de-duplicated), with the result kept for the network report. */
  get(url: string): Promise<FetchResult> {
    let pending = this.results.get(url);
    if (!pending) {
      pending = this.lookup(url).then((r) => {
        this.outcomes.set(url, r);
        return r;
      });
      this.results.set(url, pending);
    }
    return pending;
  }

  /** Lookups finished so far, and how the failed ones failed. */
  report(): NetworkReport {
    const failures = [...this.outcomes.entries()].flatMap(([url, r]) => (r.ok ? [] : [{ url, ...r.failure }]));
    return { attempted: this.outcomes.size, failures };
  }

  /** Forget results (Retry): the next lookups go to the network again, with a fresh budget. */
  reset(): void {
    this.results.clear();
    this.outcomes.clear();
    this.warm = null;
    this.deadline = null;
  }
}

export interface NetworkReport {
  attempted: number;
  failures: ({ url: string } & NetFailure)[];
}

const WORDING: Record<NetFailureKind, string> = {
  timeout: "timed out",
  dns: "DNS lookup failed",
  offline: "no network connection",
  proxy: "the proxy refused the connection; check HTTPS_PROXY and its credentials",
  tls: "certificate check failed; a proxy or firewall may be inspecting HTTPS",
  http: "HTTP error",
  connection: "connection failed",
};

/**
 * One line for a network-wide problem (most or all lookups failed), else null:
 * "Couldn't reach the version servers (timed out)."
 */
export function networkProblem(report: NetworkReport): string | null {
  const { attempted, failures } = report;
  if (failures.length < 2 || failures.length * 2 < attempted) return null;
  const counts = new Map<NetFailureKind, number>();
  for (const f of failures) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  const [kind] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
  if (kind === "http") {
    const statuses = [...new Set(failures.filter((f) => f.kind === "http").map((f) => f.detail))].join(", ");
    return `The version servers returned errors (${statuses}).`;
  }
  return `Couldn't reach the version servers (${WORDING[kind]}).`;
}

let network = new Network();

/** The run's network (tests swap it). */
export function getNetwork(): Network {
  return network;
}

export function setNetwork(next: Network): () => void {
  const previous = network;
  network = next;
  return () => {
    network = previous;
  };
}

/** GET a JSON document (see Network): resolves null on failure. */
export async function fetchJson(url: string): Promise<unknown> {
  const blocked = sideEffectsBlocked();
  if (blocked) {
    debug(`not fetching ${url}: ${blocked}`);
    return null;
  }
  const result = await network.get(url);
  return result.ok ? result.value : null;
}

/** Read a string field from an unknown JSON value. */
export function stringField(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}