import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { doctorReport, type DoctorDeps } from "../src/doctor";
import { LatestResolver, resolveLatest, summarize } from "../src/scan";
import type { ToolDescriptor } from "../src/types";
import { bannerLines, centerBlock } from "../src/ui/banner";
import { formatAgo } from "../src/ui/format";
import { renderTable } from "../src/ui/table";
import { CACHE_TTL_MS, VersionCache } from "../src/utils/cache";
import { getHost, type Host } from "../src/utils/host";
import {
  bypassesProxy,
  classifyError,
  COLD_TIMEOUT_MS,
  LOOKUP_BUDGET_MS,
  Network,
  networkProblem,
  proxyFor,
  proxySettings,
  redactProxy,
  RETRY_TIMEOUT_MS,
  WARM_TIMEOUT_MS,
  WARMUP_TIMEOUT_MS,
  WARMUP_URL,
} from "../src/utils/http";
import { instance } from "./helpers";

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
const strip = (s: string) => s.replace(ANSI, "");

/** Node's fetch wraps socket errors: TypeError("fetch failed") with the system error as cause. */
const netError = (code: string, hostname = "registry.npmjs.org") =>
  Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(`${code} ${hostname}`), { code, hostname }) });
const timeoutError = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

type Behaviour = "ok" | "hang" | { status: number } | Error;

/**
 * A Network on a fake clock: a "hang" consumes its whole attempt timeout
 * instantly, so budgets can be checked without waiting.
 */
function clockNetwork(behaviour: (url: string) => Behaviour, options: { warmUp?: boolean } = {}) {
  let now = 0;
  const attempts: { url: string; ms: number }[] = [];
  const network = new Network({
    now: () => now,
    dispatcher: () => undefined,
    warmUpUrl: options.warmUp === false ? null : WARMUP_URL,
    timeout: (ms) => Object.assign(new AbortController().signal, { ms }),
    fetch: async (url, init) => {
      const ms = (init.signal as AbortSignal & { ms: number }).ms;
      attempts.push({ url, ms });
      const b = behaviour(url);
      if (b === "hang") {
        now += ms;
        throw timeoutError();
      }
      if (b instanceof Error) throw b;
      if (b === "ok") return { ok: true, status: 200, json: async () => ({ version: "1.0.0" }) };
      return { ok: b.status < 400, status: b.status, json: async () => ({}) };
    },
  });
  return { network, attempts, now: () => now };
}

describe("diagnosis: a cold network where every lookup times out", () => {
  it("warms up once, gives the first attempt 8s, and never runs past the ~14s budget", async () => {
    const { network, attempts, now } = clockNetwork(() => "hang");
    const result = await network.get("https://registry.npmjs.org/@openai/codex/latest");
    expect(result).toMatchObject({ ok: false, failure: { kind: "timeout" } });
    expect(attempts.map((a) => a.ms)).toEqual([WARMUP_TIMEOUT_MS, COLD_TIMEOUT_MS]);
    expect(now()).toBeLessThanOrEqual(LOOKUP_BUDGET_MS);
    expect(LOOKUP_BUDGET_MS).toBeLessThan(15_000);
  });

  it("after a successful warm-up uses 5s per attempt and retries once", async () => {
    const { network, attempts } = clockNetwork((url) => (url === WARMUP_URL ? "ok" : "hang"));
    await network.get("https://registry.npmjs.org/@openai/codex/latest");
    expect(attempts.map((a) => a.ms)).toEqual([WARMUP_TIMEOUT_MS, WARM_TIMEOUT_MS, RETRY_TIMEOUT_MS]);
  });

  it("de-duplicates lookups and shares one warm-up across all of them", async () => {
    const { network, attempts } = clockNetwork(() => "ok");
    const urls = ["a", "b", "c"].map((p) => `https://registry.npmjs.org/${p}/latest`);
    await Promise.all([...urls, ...urls].map((u) => network.get(u)));
    expect(attempts.filter((a) => a.url === WARMUP_URL)).toHaveLength(1);
    expect(attempts.filter((a) => a.url !== WARMUP_URL)).toHaveLength(3);
  });

  it("retries network errors and 5xx, never a 404", async () => {
    const dns = clockNetwork(() => netError("ENOTFOUND"), { warmUp: false });
    expect(await dns.network.get("https://x.test/a")).toMatchObject({ ok: false, failure: { kind: "dns", detail: "ENOTFOUND registry.npmjs.org" } });
    expect(dns.attempts).toHaveLength(2);
    const missing = clockNetwork(() => ({ status: 404 }), { warmUp: false });
    await missing.network.get("https://x.test/b");
    expect(missing.attempts).toHaveLength(1);
    const unavailable = clockNetwork(() => ({ status: 503 }), { warmUp: false });
    expect(await unavailable.network.get("https://x.test/c")).toMatchObject({ failure: { kind: "http", detail: "HTTP 503" } });
    expect(unavailable.attempts).toHaveLength(2);
  });

  it("Retry (reset) sends the next lookups to the network again", async () => {
    let up = false;
    const { network } = clockNetwork(() => (up ? "ok" : netError("ENETUNREACH")), { warmUp: false });
    expect((await network.get("https://x.test/a")).ok).toBe(false);
    up = true;
    expect((await network.get("https://x.test/a")).ok).toBe(false); // same run: remembered
    network.reset();
    expect((await network.get("https://x.test/a")).ok).toBe(true);
  });
});

describe("explaining network failures", () => {
  it("classifies timeouts, DNS, offline, TLS and proxy refusals", () => {
    expect(classifyError(timeoutError(), 8000)).toEqual({ kind: "timeout", detail: "timed out after 8.0s" });
    expect(classifyError(netError("EAI_AGAIN")).kind).toBe("dns");
    expect(classifyError(netError("ENETUNREACH")).kind).toBe("offline");
    expect(classifyError(netError("UND_ERR_CONNECT_TIMEOUT")).kind).toBe("timeout");
    expect(classifyError(netError("SELF_SIGNED_CERT_IN_CHAIN")).kind).toBe("tls");
    // undici reports a refused CONNECT as an AbortError: that is a proxy problem, not a timeout.
    const refused = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("Proxy response (407) !== 200 when HTTP Tunneling"), { name: "AbortError", code: "UND_ERR_ABORTED" }),
    });
    expect(classifyError(refused)).toEqual({ kind: "proxy", detail: "proxy answered 407: authentication required" });
    expect(classifyError(netError("ECONNRESET")).kind).toBe("connection");
  });

  it("prints one line when most or all lookups fail, with the dominant reason", () => {
    const fail = (kind: "timeout" | "dns" | "offline" | "http", detail = "x") => ({ url: "u", kind, detail });
    expect(networkProblem({ attempted: 11, failures: Array.from({ length: 11 }, () => fail("timeout")) })).toBe(
      "Couldn't reach the version servers (timed out).",
    );
    expect(networkProblem({ attempted: 4, failures: [fail("dns"), fail("dns"), fail("timeout")] })).toBe(
      "Couldn't reach the version servers (DNS lookup failed).",
    );
    expect(networkProblem({ attempted: 3, failures: [fail("offline"), fail("offline")] })).toBe(
      "Couldn't reach the version servers (no network connection).",
    );
    expect(networkProblem({ attempted: 2, failures: [fail("http", "HTTP 503"), fail("http", "HTTP 503")] })).toBe(
      "The version servers returned errors (HTTP 503).",
    );
  });

  it("keeps a single source being down per row (no network line)", () => {
    expect(networkProblem({ attempted: 11, failures: [{ url: "https://dl.google.com/x", kind: "dns", detail: "ENOTFOUND" }] })).toBeNull();
    expect(networkProblem({ attempted: 11, failures: Array.from({ length: 3 }, () => ({ url: "u", kind: "timeout" as const, detail: "" })) })).toBeNull();
  });
});

describe("stale cache as a fallback", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  function tempHost(): Host {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ccl-caut-net-"));
    dirs.push(dir);
    return { ...getHost(), homedir: dir, env: { LOCALAPPDATA: dir, XDG_CACHE_HOME: dir } };
  }
  const tool = {
    id: "codex",
    name: "Codex CLI",
    binNames: ["codex"],
    docsUrl: "https://example.test",
    getLatestVersion: async () => null, // the live lookup fails
    getUpdatePlan: async () => null,
    getInstalledVersion: async () => "0.161.0",
  } as unknown as ToolDescriptor;

  it("uses an expired entry when the live lookup fails, and marks it", async () => {
    const host = tempHost();
    let now = 1_000_000;
    const cache = VersionCache.load(host, () => now);
    cache.set("codex:default", "0.162.1");
    now += 9 * 60 * 60 * 1000; // 9h later: expired
    expect(cache.get("codex:default")).toBeNull();
    const resolver = new LatestResolver(cache);
    const [scan] = await resolveLatest([{ tool, instances: [{ ...instance("/usr/local/bin/codex", "npm"), version: "0.161.0" }] }], resolver);
    expect(scan).toMatchObject({ latestVersion: "0.162.1", state: "outdated", latestStaleCachedAt: new Date(1_000_000).toISOString() });
    expect(summarize([scan!]).stale).toBe(1);
  });

  it("only shows unknown when there is no cached value at all", async () => {
    const resolver = new LatestResolver(VersionCache.load(tempHost()));
    const [scan] = await resolveLatest([{ tool, instances: [{ ...instance("/usr/local/bin/codex", "npm"), version: "0.161.0" }] }], resolver);
    expect(scan).toMatchObject({ latestVersion: null, state: "unknown", latestStaleCachedAt: null });
  });

  it("labels stale rows 'cached 9h ago' in the table", async () => {
    const at = new Date(Date.now() - 9 * 60 * 60 * 1000 - 60_000).toISOString();
    expect(formatAgo(at)).toBe("9h");
    expect(formatAgo(new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString())).toBe("3d");
    expect(formatAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5m");
    expect(CACHE_TTL_MS).toBe(60 * 60 * 1000);
    const row = {
      id: "codex", name: "Codex CLI", shortName: "Codex", docsUrl: "", installed: true, installMethod: "npm" as const, binaryPath: "/x",
      installedVersion: "0.161.0", latestVersion: "0.162.1", latestStaleCachedAt: at, state: "outdated" as const, updateAvailable: true,
      needsAdmin: false, plan: null, shadowed: [], deprecation: null, group: "agents" as const, notes: [], projectPin: null,
    };
    expect(strip(renderTable([row]))).toContain("0.162.1 cached 9h ago");
  });
});

describe("proxies", () => {
  it("reads HTTPS_PROXY / HTTP_PROXY / NO_PROXY in either case", () => {
    expect(proxySettings({ https_proxy: "http://p:8080", NO_PROXY: "localhost" })).toEqual({ httpsProxy: "http://p:8080", httpProxy: null, noProxy: "localhost" });
    expect(proxySettings({})).toEqual({ httpsProxy: null, httpProxy: null, noProxy: null });
  });

  it("routes https through HTTPS_PROXY (else HTTP_PROXY) unless NO_PROXY matches", () => {
    const p = { httpsProxy: "http://corp:3128", httpProxy: null, noProxy: ".npmjs.org, dl.google.com:443 internal.example" };
    expect(proxyFor("https://registry.npmjs.org/x", p)).toBeNull();
    expect(proxyFor("https://dl.google.com/x", p)).toBeNull();
    expect(proxyFor("https://api.github.com/x", p)).toBe("http://corp:3128");
    expect(proxyFor("https://api.github.com/x", { httpsProxy: null, httpProxy: "http://h:80", noProxy: null })).toBe("http://h:80");
    expect(bypassesProxy("https://anything.test/", "*")).toBe(true);
    expect(bypassesProxy("https://notnpmjs.org/", ".npmjs.org")).toBe(false);
    expect(bypassesProxy("https://dl.google.com/", "dl.google.com:8443")).toBe(false);
  });

  it("never prints proxy credentials", () => {
    expect(redactProxy("http://alice:s3cret@corp:3128")).toBe("http://***@corp:3128");
    expect(redactProxy("http://corp:3128/")).toBe("http://corp:3128");
    expect(redactProxy(null)).toBeNull();
  });
});

describe("ccl-caut --doctor", () => {
  it("reports each version host with DNS and HTTPS results, the proxy and the files", async () => {
    let t = 0;
    const deps: DoctorDeps = {
      resolve: async (host) => {
        if (host === "pypi.org") throw Object.assign(new Error("ENOTFOUND pypi.org"), { code: "ENOTFOUND", hostname: "pypi.org" });
        t += 12;
        return { address: "203.0.113.7" };
      },
      head: async (url) => {
        if (url.includes("api.github.com")) throw timeoutError();
        if (url.includes("pypi.org")) throw netError("ENOTFOUND", "pypi.org");
        t += 200;
        return { status: 200 };
      },
      now: () => t,
      env: { HTTPS_PROXY: "http://bob:pw@corp:3128" },
    };
    const { lines, code } = await doctorReport("1.0.1", deps);
    const text = strip(lines.join("\n"));
    expect(code).toBe(1);
    expect(text).toMatch(/✔ registry\.npmjs\.org\s+reachable · DNS \d+ms · HTTPS 200 in \d+ms/);
    expect(text).toMatch(/✖ api\.github\.com\s+unreachable · DNS \d+ms · timeout \(timed out after 8\.0s\)/);
    expect(text).toMatch(/✖ pypi\.org\s+unreachable · DNS failed \(ENOTFOUND pypi\.org\) · DNS error/);
    expect(text).toContain("HTTPS_PROXY  http://***@corp:3128");
    expect(text).not.toContain("pw@");
    expect(text).toMatch(/cache\s+/);
    expect(text).toContain("2 of 4 version servers unreachable: api.github.com, pypi.org.");
  });
});

describe("centered banner", () => {
  it("pads a block by floor((columns - visible width) / 2), ignoring color codes", () => {
    const colored = `${String.fromCharCode(27)}[36mabcd${String.fromCharCode(27)}[39m`;
    expect(centerBlock([colored, "ab"], 11)).toEqual([`   ${colored}`, "   ab"]);
    expect(centerBlock(["toolong"], 4)).toEqual(["toolong"]);
  });

  it("centers the big art and the subtitle separately, only when asked", () => {
    const plain = (s: string) => s;
    const centered = bannerLines("1.0.1", { columns: 140, center: true, color: plain }).map(strip);
    const left = bannerLines("1.0.1", { columns: 140, center: false, color: plain }).map(strip);
    const artWidth = Math.max(...left.slice(0, -1).map((l) => l.length));
    const subtitle = left[left.length - 1]!;
    expect(left[0]!.startsWith(" ") || left[0]!.startsWith("█")).toBe(true);
    expect(centered[0]).toBe(" ".repeat(Math.floor((140 - artWidth) / 2)) + left[0]);
    expect(centered[centered.length - 1]).toBe(" ".repeat(Math.floor((140 - subtitle.length) / 2)) + subtitle);
  });

  it("centers the compact banner on narrow terminals", () => {
    const line = strip(bannerLines("1.0.1", { columns: 40, center: true, color: (s) => s })[0]!);
    expect(line.trimStart()).toBe("CCL CAUT v1.0.1");
    expect(line.length - line.trimStart().length).toBe(Math.floor((40 - "CCL CAUT v1.0.1".length) / 2));
  });
});