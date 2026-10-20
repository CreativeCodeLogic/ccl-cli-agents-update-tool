import { afterEach, describe, expect, it } from "vitest";
import { selfUpdateTarget } from "../src/self";
import { SELF_ID, selfLast, selfUpdateFailureHint, selfUpdatePlan, selfUpdateRow } from "../src/selfupdate";
import { initialSelection, isOffered } from "../src/selection";
import { setHost, type Host } from "../src/utils/host";
import { primeNpmGlobalPaths } from "../src/utils/npm";
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

describe("which ccl-caut version to offer", () => {
  it("stable users get latest, never a beta", () => {
    expect(selfUpdateTarget("1.1.0", "1.2.0", "1.3.0-beta.1")).toEqual({ version: "1.2.0", channel: "latest" });
    expect(selfUpdateTarget("1.1.0", "1.1.0", "1.2.0-beta.1")).toBeNull();
  });
  it("prerelease users get next when it is newer, else latest; never a downgrade", () => {
    expect(selfUpdateTarget("1.2.0-beta.1", "1.1.0", "1.2.0-beta.2")).toEqual({ version: "1.2.0-beta.2", channel: "next" });
    expect(selfUpdateTarget("1.2.0-beta.2", "1.2.0", "1.2.0-beta.2")).toEqual({ version: "1.2.0", channel: "latest" });
    expect(selfUpdateTarget("1.1.0-selftest.0", "1.1.0", "1.1.0")).toEqual({ version: "1.1.0", channel: "latest" });
    expect(selfUpdateTarget("1.2.0", "1.1.0", null)).toBeNull();
  });
});

describe("the self-update plan", () => {
  const linuxRoot = "/usr/local/lib/node_modules";
  const entry = `${linuxRoot}/ccl-caut/dist/index.js`;

  it("global install in the active npm prefix: automatic, with the exact version (not the tag)", async () => {
    use(fakeHost({ platform: "linux", homedir: "/home/jane" }));
    primeNpmGlobalPaths({ prefix: "/usr/local", root: linuxRoot });
    const plan = await selfUpdatePlan({ path: "/usr/local/bin/ccl-caut", realPath: entry, installMethod: "npm" }, "1.2.0");
    expect(plan).toEqual({ kind: "auto", command: ["npm", "install", "-g", "ccl-caut@1.2.0"] });
  });

  it("Windows shim in the npm prefix: automatic", async () => {
    const prefix = win("C:/Users/Jane/AppData/Roaming/npm");
    use(fakeHost({ platform: "win32", homedir: win("C:/Users/Jane") }));
    primeNpmGlobalPaths({ prefix, root: win(`${prefix}/node_modules`) });
    const plan = await selfUpdatePlan({ path: win(`${prefix}/ccl-caut.cmd`), realPath: win(`${prefix}/node_modules/ccl-caut/dist/index.js`), installMethod: "npm" }, "1.2.0");
    expect(plan.kind).toBe("auto");
  });

  it("another prefix (nvm, fnm, another Node): manual, same reason as other npm tools", async () => {
    use(fakeHost({ platform: "linux", homedir: "/home/jane" }));
    primeNpmGlobalPaths({ prefix: "/usr/local", root: linuxRoot });
    const nvm = "/home/jane/.nvm/versions/node/v20.19.0";
    const plan = await selfUpdatePlan({ path: `${nvm}/bin/ccl-caut`, realPath: `${nvm}/lib/node_modules/ccl-caut/dist/index.js`, installMethod: "npm" }, "1.2.0");
    expect(plan).toMatchObject({ kind: "manual", command: "npm install -g ccl-caut@1.2.0" });
  });

  it("Volta: manual `volta install`", async () => {
    use(fakeHost({ platform: "linux", homedir: "/home/jane" }));
    primeNpmGlobalPaths({ prefix: "/usr/local", root: linuxRoot });
    const plan = await selfUpdatePlan({ path: "/home/jane/.volta/bin/ccl-caut", realPath: "/home/jane/.volta/tools/image/packages/ccl-caut/lib/node_modules/ccl-caut/dist/index.js", installMethod: "npm" }, "1.2.0");
    expect(plan).toMatchObject({ kind: "manual", command: "volta install ccl-caut@1.2.0" });
  });
});

describe("the CCL CAUT checklist row", () => {
  const entry = "/usr/local/lib/node_modules/ccl-caut/dist/index.js";
  const setup = () => {
    use(fakeHost({ platform: "linux", homedir: "/home/jane", env: { PATH: "/usr/local/bin" }, files: ["/usr/local/bin/ccl-caut"], writable: ["/usr/local"] }));
    primeNpmGlobalPaths({ prefix: "/usr/local", root: "/usr/local/lib/node_modules" });
  };

  it("a global install with a newer version: an outdated, preselected row in its own section", async () => {
    setup();
    const row = await selfUpdateRow({ current: "1.1.0", target: "1.2.0", context: "global", entryPath: entry });
    expect(row?.scan).toMatchObject({ id: SELF_ID, name: "CCL CAUT", group: "self", installedVersion: "1.1.0", latestVersion: "1.2.0", state: "outdated", needsAdmin: false });
    expect(row?.instance.path).toBe("/usr/local/bin/ccl-caut");
    expect(isOffered(row!.scan)).toBe(true);
    expect(initialSelection([row!.scan], {}).ids).toEqual([SELF_ID]);
    expect(initialSelection([row!.scan], { [SELF_ID]: "skip" }).ids).toEqual([]); // remembered like any tool
  });

  it.each(["npx", "source", "project", null] as const)("no row when run as %s", async (context) => {
    setup();
    expect(await selfUpdateRow({ current: "1.1.0", target: "1.2.0", context, entryPath: entry })).toBeNull();
  });

  it("no row without a newer version", async () => {
    setup();
    expect(await selfUpdateRow({ current: "1.1.0", target: null, context: "global", entryPath: entry })).toBeNull();
  });
});

describe("running the self-update", () => {
  it("always last", () => {
    const t = (id: string) => ({ scan: { id } });
    expect(selfLast([t(SELF_ID), t("codex"), t("claude")]).map((x) => x.scan.id)).toEqual(["codex", "claude", SELF_ID]);
  });

  it("explains files in use (Windows EBUSY/EPERM) with the manual command", () => {
    expect(selfUpdateFailureHint("npm error code EBUSY\nnpm error syscall rename", "1.2.0")).toContain("npm install -g ccl-caut@1.2.0");
    expect(selfUpdateFailureHint("npm error code EPERM", "1.2.0")).toContain("in use");
    expect(selfUpdateFailureHint("npm error 404", "1.2.0")).toBeNull();
  });
});