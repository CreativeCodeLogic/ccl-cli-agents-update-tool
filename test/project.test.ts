import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findProjectManifest, projectPinFor, projectPinNote } from "../src/project";
import { firebase } from "../src/registry/firebase";
import { resolveLatest, LatestResolver } from "../src/scan";
import { getHost, setHost } from "../src/utils/host";
import { fakeHost, instance } from "./helpers";

const pkgJson = (deps: Record<string, Record<string, string>>) => JSON.stringify({ name: "app", ...deps });
const linux = (texts: Record<string, string>, files: string[] = []) => fakeHost({ platform: "linux", homedir: "/home/jane", texts, files });

describe("project-copy check (read-only)", () => {
  it("finds nothing without a package.json up to the repository root", () => {
    const host = linux({}, ["/work/repo/.git/HEAD", "/package.json"]);
    // Stops at the first folder with .git: the /package.json above the repo is never read.
    expect(findProjectManifest("/work/repo/src/deep", host)).toBeNull();
    expect(findProjectManifest("/tmp/x", linux({}))).toBeNull();
  });

  it("uses the nearest package.json in a nested monorepo", () => {
    const host = linux({
      "/mono/package.json": pkgJson({ devDependencies: { "firebase-tools": "^12.0.0" } }),
      "/mono/packages/web/package.json": pkgJson({ dependencies: { "firebase-tools": "13.29.1" } }),
    });
    const project = findProjectManifest("/mono/packages/web/src", host);
    expect(project?.file).toBe("/mono/packages/web/package.json");
    expect(projectPinFor(firebase, project, host)).toMatchObject({ pkg: "firebase-tools", range: "13.29.1", field: "dependencies" });
  });

  it("reports which field pins it (devDependencies vs dependencies)", () => {
    const host = linux({ "/app/package.json": pkgJson({ devDependencies: { "firebase-tools": "^13.0.0" } }) });
    expect(projectPinFor(firebase, findProjectManifest("/app", host), host)).toEqual({
      packageJson: "/app/package.json",
      pkg: "firebase-tools",
      range: "^13.0.0",
      field: "devDependencies",
      installedVersion: null,
    });
  });

  it("ignores a malformed package.json silently", () => {
    const host = linux({ "/app/package.json": "{ not json" });
    expect(findProjectManifest("/app", host)).toBeNull();
  });

  it("includes the version installed in the project's node_modules", () => {
    const host = linux({
      "/app/package.json": pkgJson({ optionalDependencies: { "firebase-tools": "~13.29.0" } }),
      "/app/node_modules/firebase-tools/package.json": JSON.stringify({ name: "firebase-tools", version: "13.29.1" }),
    });
    const pin = projectPinFor(firebase, findProjectManifest("/app", host), host)!;
    expect(pin).toMatchObject({ field: "optionalDependencies", installedVersion: "13.29.1" });
    expect(projectPinNote(pin, "firebase")).toEqual({
      kind: "info",
      message:
        "This project pins firebase-tools ~13.29.0 (optionalDependencies; 13.29.1 in node_modules). Updating the global copy won't affect it; use `npx firebase` here.",
    });
  });

  it("uses projectPackages when a tool's project package differs", () => {
    const host = linux({ "/app/package.json": pkgJson({ devDependencies: { supabase: "^2.0.0" } }) });
    const project = findProjectManifest("/app", host);
    expect(projectPinFor({ npmPackage: "@supabase/cli-native", projectPackages: ["supabase"] }, project, host)?.pkg).toBe("supabase");
    expect(projectPinFor({}, project, host)).toBeNull();
  });

  it("adds an info note and projectPin to the scan result, never changing the state", async () => {
    const host = linux({ "/app/package.json": pkgJson({ devDependencies: { "firebase-tools": "^13.0.0" } }) });
    const restore = setHost(host);
    try {
      const tool = { ...firebase, getLatestVersion: async () => "15.33.0", getUpdatePlan: async () => ({ kind: "auto" as const, command: ["npm"] }) };
      const [scan] = await resolveLatest(
        [{ tool, instances: [{ ...instance("/usr/local/bin/firebase", "npm"), version: "15.33.0" }] }],
        new LatestResolver(),
        findProjectManifest("/app", host),
      );
      expect(scan).toMatchObject({ state: "up-to-date", group: "dev", projectPin: { pkg: "firebase-tools" } });
      expect(scan!.notes[0]!.message).toContain("This project pins firebase-tools ^13.0.0 (devDependencies)");
    } finally {
      restore();
    }
  });

  describe("on the real filesystem", () => {
    const dirs: string[] = [];
    afterEach(() => {
      for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    });

    it("costs well under 20ms, even from a deep folder", () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), "ccl-caut-project-"));
      dirs.push(dir);
      writeFileSync(path.join(dir, "package.json"), pkgJson({ devDependencies: { "firebase-tools": "^13.0.0" } }));
      const deep = path.join(dir, "a", "b", "c", "d", "e", "f");
      mkdirSync(deep, { recursive: true });
      const host = getHost();
      findProjectManifest(deep, host); // warm the fs cache like a real run's first syscalls
      const start = performance.now();
      const project = findProjectManifest(deep, host);
      const pin = projectPinFor(firebase, project, host);
      const ms = performance.now() - start;
      expect(pin?.field).toBe("devDependencies");
      expect(ms).toBeLessThan(20);
    });
  });
});