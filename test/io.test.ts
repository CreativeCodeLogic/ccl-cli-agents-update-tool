import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { codex } from "../src/registry/codex";
import { gcloud } from "../src/registry/gcloud";
import { kimi } from "../src/registry/kimi";
import { exec } from "../src/utils/exec";
import { fetchJson, stringField } from "../src/utils/http";
import { fetchLatestNpmVersion, readPackageVersionNear } from "../src/utils/npm";
import { instance, useFakeFetch } from "./helpers";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ccl-caut-io-"));
  dirs.push(dir);
  return dir;
}
function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}
const netRestores: (() => void)[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  for (const r of netRestores.splice(0)) r();
});

describe("exec", () => {
  it("captures stdout of a successful command", async () => {
    const res = await exec(process.execPath, ["-e", "console.log('v1.2.3')"]);
    expect(res).toMatchObject({ ok: true, code: 0 });
    expect(res.stdout.trim()).toBe("v1.2.3");
  });

  it("reports non-zero exits, missing binaries and timeouts without throwing", async () => {
    expect(await exec(process.execPath, ["-e", "process.exit(3)"])).toMatchObject({ ok: false, code: 3 });
    expect((await exec("ccl-caut-definitely-missing-binary", [])).ok).toBe(false);
    const slow = await exec(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], 200);
    expect(slow).toMatchObject({ ok: false, code: null });
  });
});

describe("installed versions from disk", () => {
  it("reads an npm package version next to a Windows-style shim", async () => {
    const prefix = tempDir();
    writeJson(path.join(prefix, "node_modules", "@openai", "codex", "package.json"), { name: "@openai/codex", version: "0.162.1" });
    const shim = path.join(prefix, "codex.cmd");
    expect(await readPackageVersionNear(shim, shim, "@openai/codex")).toBe("0.162.1");
    expect(await codex.getInstalledVersion(instance(shim, "npm"))).toBe("0.162.1");
  });

  it("walks up from a POSIX-style symlink target, ignoring other packages", async () => {
    const root = tempDir();
    const pkgDir = path.join(root, "lib", "node_modules", "@openai", "codex");
    writeJson(path.join(pkgDir, "package.json"), { name: "@openai/codex", version: "0.150.0" });
    writeJson(path.join(pkgDir, "bin", "package.json"), { name: "something-else", version: "9.9.9" });
    const target = path.join(pkgDir, "bin", "codex.js");
    expect(await readPackageVersionNear(path.join(root, "bin", "codex"), target, "@openai/codex")).toBe("0.150.0");
  });

  it("reads gcloud's VERSION file instead of spawning gcloud", async () => {
    const sdk = tempDir();
    writeFileSync(path.join(sdk, "VERSION"), "563.0.0\n");
    const bin = path.join(sdk, "bin", "gcloud");
    expect(await gcloud.getInstalledVersion(instance(bin, "native"))).toBe("563.0.0");
  });
});

describe("network lookups", () => {
  function stubFetch(handler: (url: string) => Response | Promise<Response>) {
    const fn = vi.fn(async (input: string | URL | Request) => handler(String(input)));
    netRestores.push(useFakeFetch(fn));
    return fn;
  }

  it("retries once, then caches the document for the rest of the run", async () => {
    let calls = 0;
    const fetchMock = stubFetch(() => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET");
      return Response.json({ version: "1.0.0" });
    });
    const url = `https://example.test/retry-${Date.now()}`;
    expect(await fetchJson(url)).toEqual({ version: "1.0.0" });
    expect(await fetchJson(url)).toEqual({ version: "1.0.0" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves null on HTTP errors", async () => {
    stubFetch(() => new Response("nope", { status: 404 }));
    expect(await fetchJson(`https://example.test/missing-${Date.now()}`)).toBeNull();
  });

  it("reads latest versions from npm, PyPI and the Cloud SDK feed", async () => {
    stubFetch((url) => {
      if (url.includes("registry.npmjs.org/@openai/codex/latest")) return Response.json({ version: "0.162.1" });
      if (url.includes("registry.npmjs.org/@moonshot-ai/kimi-code/latest")) return Response.json({ version: "2.1.1" });
      if (url.includes("pypi.org/pypi/kimi-cli/json")) return Response.json({ info: { version: "1.52.0" } });
      if (url.includes("components-2.json")) return Response.json({ version: "588.0.0", components: [] });
      return new Response("", { status: 500 });
    });
    expect(await fetchLatestNpmVersion("@openai/codex")).toBe("0.162.1");
    expect(await kimi.getLatestVersion("native")).toBe("2.1.1");
    expect(await kimi.getLatestVersion("pip")).toBe("1.52.0");
    expect(await gcloud.getLatestVersion()).toBe("588.0.0");
  });

  it("stringField only returns strings", () => {
    expect(stringField({ v: "1" }, "v")).toBe("1");
    expect(stringField({ v: 1 }, "v")).toBeNull();
    expect(stringField(null, "v")).toBeNull();
  });
});