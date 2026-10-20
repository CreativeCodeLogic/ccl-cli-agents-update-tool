import { afterEach, describe, expect, it, vi } from "vitest";
import { antigravity } from "../src/registry/antigravity";
import { copilot } from "../src/registry/copilot";
import { gh } from "../src/registry/gh";
import { opencode } from "../src/registry/opencode";
import { registry } from "../src/registry";
import { LatestResolver, resolveLatest } from "../src/scan";
import { initialSelection } from "../src/selection";
import { applyUpdates, updateExitCode, type UpdateTarget } from "../src/ui/update";
import { setHost, type Host } from "../src/utils/host";
import { primeNpmGlobalPaths } from "../src/utils/npm";
import {
  newestWingetVersion,
  wingetAvailability,
  wingetExitKind,
  wingetManifestPath,
  wingetPlan,
  wingetScope,
  wingetUpgradeCommand,
} from "../src/utils/winget";
import { fakeHost, win } from "./helpers";

const restores: (() => void)[] = [];
afterEach(() => {
  for (const r of restores.splice(0)) r();
  primeNpmGlobalPaths(null);
});
const use = (host: Host) => {
  restores.push(setHost(host));
  return host;
};

const home = win("C:/Users/Jane");
const local = win("C:/Users/Jane/AppData/Local");
const host = () => fakeHost({ platform: "win32", homedir: home, env: { LOCALAPPDATA: local, ProgramFiles: win("C:/Program Files") } });
const links = (bin: string) => win(`${local}/Microsoft/WinGet/Links/${bin}.exe`);
const pkgDir = (id: string, bin: string) => win(`${local}/Microsoft/WinGet/Packages/${id}_Microsoft.Winget.Source_8wekyb3d8bbwe/${bin}.exe`);

describe("winget install scope", () => {
  it("per-user: the command alias in WinGet\\Links or the package in WinGet\\Packages", () => {
    expect(wingetScope({ path: links("opencode"), realPath: pkgDir("SST.opencode", "opencode") }, host())).toBe("user");
    expect(wingetScope({ path: pkgDir("SST.opencode", "opencode"), realPath: pkgDir("SST.opencode", "opencode") }, host())).toBe("user");
  });
  it("machine: %ProgramFiles%\\WinGet; anything else is unknown", () => {
    expect(wingetScope({ path: win("C:/Program Files/WinGet/Links/agy.exe"), realPath: win("C:/Program Files/WinGet/Packages/x/agy.exe") }, host())).toBe("machine");
    expect(wingetScope({ path: win("C:/tools/agy.exe"), realPath: win("C:/tools/agy.exe") }, host())).toBeNull();
  });
});

describe("winget plans", () => {
  const user = { path: links("opencode"), realPath: pkgDir("SST.opencode", "opencode") };

  it("the documented, non-interactive upgrade command, limited to the per-user install", () => {
    expect(wingetUpgradeCommand("SST.opencode")).toEqual([
      "winget", "upgrade", "--id", "SST.opencode", "--exact", "--source", "winget", "--scope", "user",
      "--silent", "--accept-source-agreements", "--accept-package-agreements", "--disable-interactivity",
    ]);
  });

  it("allowlisted and per-user: automatic", () => {
    expect(wingetPlan(user, { id: "SST.opencode", auto: true }, host())).toEqual({ kind: "auto", command: wingetUpgradeCommand("SST.opencode") });
  });

  it("not on the allowlist: a command to copy", () => {
    expect(wingetPlan(user, { id: "GitHub.Copilot", auto: false }, host())).toMatchObject({ kind: "manual", command: "winget upgrade --id GitHub.Copilot --exact --source winget" });
  });

  it("machine scope: manual and needs admin (--yes never elevates); unknown scope: manual", () => {
    const machine = { path: win("C:/Program Files/WinGet/Links/agy.exe"), realPath: win("C:/Program Files/WinGet/Packages/x/agy.exe") };
    expect(wingetPlan(machine, { id: "Google.AntigravityCLI", auto: true }, host())).toMatchObject({ kind: "manual", needsAdmin: true });
    expect(wingetPlan({ path: win("C:/tools/agy.exe"), realPath: win("C:/tools/agy.exe") }, { id: "Google.AntigravityCLI", auto: true }, host()).kind).toBe("manual");
  });

  it("the allowlist: OpenCode, Antigravity and GitHub CLI (verified); Copilot stays manual", () => {
    expect(opencode.winget).toEqual({ id: "SST.opencode", auto: true });
    expect(antigravity.winget).toEqual({ id: "Google.AntigravityCLI", auto: true });
    expect(gh.winget).toEqual({ id: "GitHub.cli", auto: true });
    expect(copilot.winget).toEqual({ id: "GitHub.Copilot", auto: false });
    expect(registry.filter((t) => t.winget?.auto).map((t) => t.id).sort()).toEqual(["antigravity", "gh", "opencode"]);
  });
});

describe("winget exit codes", () => {
  it.each([
    [-1978335189, "not-applicable"], // 0x8A15002B no applicable update (signed)
    [2316632107, "not-applicable"], // the same, unsigned
    [-1978335153, "not-applicable"], // 0x8A15004F not newer
    [-1978334975, "in-use"], // 0x8A150101 application running
    [-1978335207, "needs-admin"], // 0x8A150019 requires admin
    [1, null],
    [null, null],
  ] as const)("%s -> %s", (code, kind) => {
    expect(wingetExitKind(code)).toBe(kind);
  });
});

describe("what winget has", () => {
  it("finds the newest version folder in winget-pkgs (v-prefixed or not, sub-packages skipped)", () => {
    expect(newestWingetVersion(["v1.0.97", "v1.0.98", "v1.0.100", "Prerelease"])).toBe("1.0.100");
    expect(newestWingetVersion(["1.4.10", "1.4.9", "1.3.6"])).toBe("1.4.10");
    expect(newestWingetVersion([])).toBeNull();
    expect(wingetManifestPath("SST.opencode")).toBe("manifests/s/SST/opencode");
    expect(wingetManifestPath("Google.AntigravityCLI")).toBe("manifests/g/Google/AntigravityCLI");
  });

  it("waits for winget when the vendor's version isn't there yet; no opinion when unknown", async () => {
    const pkg = { id: "SST.opencode", auto: true };
    const lagging = await wingetAvailability(pkg, "OpenCode", "1.19.3", async () => "1.19.1");
    expect(lagging?.message).toBe("OpenCode 1.19.3 isn't in winget yet (winget has 1.19.1); waiting for winget.");
    expect(lagging?.plan.kind).toBe("manual");
    expect(await wingetAvailability(pkg, "OpenCode", "1.19.3", async () => "1.19.3")).toBeNull();
    expect(await wingetAvailability(pkg, "OpenCode", "1.19.3", async () => null)).toBeNull();
  });
});

describe("a scan of a per-user winget OpenCode", () => {
  const active = { path: links("opencode"), realPath: pkgDir("SST.opencode", "opencode"), installMethod: "winget" as const, version: "1.19.0" };
  const resolver = (wingetHas: string | null) => {
    const r = new LatestResolver(null);
    vi.spyOn(r, "get").mockResolvedValue("1.19.1");
    const getByKey = r.getByKey.bind(r);
    vi.spyOn(r, "getByKey").mockImplementation((key, fetch, trackAge, ttl) => (key.startsWith("winget:") ? Promise.resolve(wingetHas) : getByKey(key, fetch, trackAge, ttl)));
    return r;
  };

  it("winget has the latest: automatic and preselected", async () => {
    use(host());
    primeNpmGlobalPaths(null);
    const [scan] = await resolveLatest([{ tool: opencode, instances: [active] }], resolver("1.19.1"));
    expect(scan?.plan).toEqual({ kind: "auto", command: wingetUpgradeCommand("SST.opencode") });
    expect(scan?.compatibility).toBeNull();
    expect(initialSelection([scan!], {}).ids).toEqual(["opencode"]);
  });

  it("winget is behind: update available, waiting for winget, never preselected", async () => {
    use(host());
    primeNpmGlobalPaths(null);
    const [scan] = await resolveLatest([{ tool: opencode, instances: [active] }], resolver("1.19.0"));
    expect(scan?.state).toBe("outdated");
    expect(scan?.compatibility).toContain("waiting for winget");
    expect(scan?.plan?.kind).toBe("manual");
    expect(initialSelection([scan!], { opencode: "update" }).ids).toEqual([]);
  });
});

describe("running a winget update", () => {
  it("'no applicable update' is held (waiting for winget), not a failure", async () => {
    use(host());
    const target = {
      scan: { id: "opencode", name: "OpenCode", latestVersion: "1.19.1", installedVersion: "1.19.0", state: "outdated", plan: { kind: "auto", command: wingetUpgradeCommand("SST.opencode") } },
      tool: opencode,
      instance: { path: links("opencode"), realPath: pkgDir("SST.opencode", "opencode"), installMethod: "winget" },
    } as unknown as UpdateTarget;
    const outcome = await applyUpdates([target], null, async () => ({ code: 2316632107, output: "No available upgrade found." }));
    expect(outcome).toMatchObject({ held: 1, failed: 0, updated: 0 });
    expect(updateExitCode(outcome, 0)).toBe(0);
  });
});