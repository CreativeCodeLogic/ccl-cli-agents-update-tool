import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configDir, UserConfig } from "../src/utils/config";
import { getHost, type Host } from "../src/utils/host";
import { fakeHost, win } from "./helpers";

describe("configDir", () => {
  it("uses the OS config location, not the cache folder", () => {
    expect(configDir(fakeHost({ platform: "win32", homedir: win("C:/Users/Jane"), env: { APPDATA: win("C:/Users/Jane/AppData/Roaming") } }))).toBe(
      win("C:/Users/Jane/AppData/Roaming/ccl-caut"),
    );
    expect(configDir(fakeHost({ platform: "win32", homedir: win("C:/Users/Jane") }))).toBe(win("C:/Users/Jane/AppData/Roaming/ccl-caut"));
    expect(configDir(fakeHost({ platform: "darwin", homedir: "/Users/jane" }))).toBe("/Users/jane/.config/ccl-caut");
    expect(configDir(fakeHost({ platform: "linux", homedir: "/home/jane", env: { XDG_CONFIG_HOME: "/x" } }))).toBe("/x/ccl-caut");
    expect(configDir(fakeHost({ platform: "linux", homedir: "/home/jane" }))).toBe("/home/jane/.config/ccl-caut");
  });
});

describe("UserConfig on disk", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function tempHost(): { host: Host; file: string } {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ccl-caut-config-"));
    dirs.push(dir);
    const host: Host = { ...getHost(), homedir: dir, env: { APPDATA: dir, XDG_CONFIG_HOME: dir } };
    return { host, file: path.join(configDir(host)!, "config.json") };
  }

  it("round-trips choices with a schema version", () => {
    const { host, file } = tempHost();
    UserConfig.load(host).saveChoices({ codex: "update", gcloud: "skip" }, host);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ schema: 1, tools: { codex: "update", gcloud: "skip" } });
    expect(UserConfig.load(host).toolChoices).toEqual({ codex: "update", gcloud: "skip" });
  });

  it("reset() forgets everything and removes the file", () => {
    const { host, file } = tempHost();
    const config = UserConfig.load(host);
    config.saveChoices({ codex: "skip" }, host);
    config.reset();
    expect(config.toolChoices).toEqual({});
    expect(existsSync(file)).toBe(false);
  });

  it.each([
    ["corrupt JSON", "{ nope"],
    ["unknown schema", JSON.stringify({ schema: 3, tools: { codex: "update" } })],
  ])("ignores a config file with %s", (_label, content) => {
    const { host, file } = tempHost();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    expect(UserConfig.load(host).toolChoices).toEqual({});
  });

  it("reads a 1.0 file and adds hiddenGroups as an extra key, keeping schema 1", () => {
    const { host, file } = tempHost();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ schema: 1, tools: { codex: "update", kimi: "skip" } }));
    const config = UserConfig.load(host);
    expect(config.toolChoices).toEqual({ codex: "update", kimi: "skip" });
    expect(config.hiddenGroups).toEqual([]);
    config.setGroupHidden("dev", true, host);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ schema: 1, tools: { codex: "update", kimi: "skip" }, hiddenGroups: ["dev"] });
  });

  it("migrates a schema 2 file from a 1.1 development build back to the shape 1.0.x reads", () => {
    const { host, file } = tempHost();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ schema: 2, tools: { codex: "skip" }, hiddenGroups: ["dev"] }));
    const config = UserConfig.load(host);
    expect(config.toolChoices).toEqual({ codex: "skip" });
    expect(config.hiddenGroups).toEqual(["dev"]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ schema: 1, tools: { codex: "skip" }, hiddenGroups: ["dev"] });
  });

  it("downgrade safety: the 1.0.1 parser (verbatim) keeps the per-tool selections of a 1.1 file", () => {
    const { host, file } = tempHost();
    const config = UserConfig.load(host);
    config.saveChoices({ codex: "update", gcloud: "skip" }, host);
    config.setGroupHidden("dev", true, host);
    config.markDiscoverUsed(host);
    // src/utils/config.ts UserConfig.load at 1.0.1 (commit f03ae31):
    const isChoice = (value: unknown) => value === "update" || value === "skip";
    const load101 = (text: string) => {
      const choices: Record<string, string> = {};
      try {
        const parsed = JSON.parse(text) as { schema?: unknown; tools?: Record<string, unknown> } | null;
        if (parsed?.schema !== 1 || typeof parsed.tools !== "object" || parsed.tools === null) {
          throw new Error("unexpected config format");
        }
        for (const [id, choice] of Object.entries(parsed.tools)) if (isChoice(choice)) choices[id] = choice as string;
      } catch {
        // 1.0.1 ignores the file
      }
      return choices;
    };
    expect(load101(readFileSync(file, "utf8"))).toEqual({ codex: "update", gcloud: "skip" });
  });

  it("hides and shows groups persistently, ignoring unknown group names", () => {
    const { host, file } = tempHost();
    UserConfig.load(host).setGroupHidden("dev", true, host);
    expect(UserConfig.load(host).hiddenGroups).toEqual(["dev"]);
    UserConfig.load(host).setGroupHidden("dev", false, host);
    expect(UserConfig.load(host).hiddenGroups).toEqual([]);
    writeFileSync(file, JSON.stringify({ schema: 1, tools: {}, hiddenGroups: ["dev", "games", "dev"] }));
    expect(UserConfig.load(host).hiddenGroups).toEqual(["dev"]);
  });

  it("--reset-selection keeps hidden groups", () => {
    const { host, file } = tempHost();
    const config = UserConfig.load(host);
    config.saveChoices({ codex: "skip" }, host);
    config.setGroupHidden("dev", true, host);
    config.reset(host);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ schema: 1, tools: {}, hiddenGroups: ["dev"] });
  });

  it("remembers that --discover was run, as an extra key on schema 1", () => {
    const { host, file } = tempHost();
    expect(UserConfig.load(host).discoverUsed).toBe(false);
    UserConfig.load(host).markDiscoverUsed(host);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ schema: 1, tools: {}, discoverUsed: true });
    expect(UserConfig.load(host).discoverUsed).toBe(true);
  });

  it("--reset-selection forgets the selections but keeps discoverUsed", () => {
    const { host, file } = tempHost();
    const config = UserConfig.load(host);
    config.saveChoices({ codex: "skip" }, host);
    config.markDiscoverUsed(host);
    config.reset(host);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ schema: 1, tools: {}, discoverUsed: true });
    expect(UserConfig.load(host).discoverUsed).toBe(true);
  });

  it("a 1.1 file without discoverUsed reads as not run; only true counts", () => {
    const { host, file } = tempHost();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ schema: 1, tools: { codex: "update" }, starShownVersion: "1.1.0" }));
    expect(UserConfig.load(host).discoverUsed).toBe(false);
    writeFileSync(file, JSON.stringify({ schema: 1, tools: {}, discoverUsed: "yes" }));
    expect(UserConfig.load(host).discoverUsed).toBe(false);
  });

  it("an unreadable config (a folder where the file should be) doesn't crash; the hint just stays", () => {
    const { host, file } = tempHost();
    mkdirSync(file, { recursive: true });
    const config = UserConfig.load(host);
    expect(config.discoverUsed).toBe(false);
    expect(() => config.markDiscoverUsed(host)).not.toThrow();
    expect(config.discoverUsed).toBe(true);
  });
  it("drops invalid choice values but keeps valid ones", () => {
    const { host, file } = tempHost();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ schema: 1, tools: { codex: "update", gcloud: "maybe" } }));
    expect(UserConfig.load(host).toolChoices).toEqual({ codex: "update" });
  });

  it("never throws when the config cannot be written", () => {
    const { host } = tempHost();
    const blocker = path.join(host.homedir, "file-not-dir");
    writeFileSync(blocker, "");
    const blocked: Host = { ...host, env: { APPDATA: blocker, XDG_CONFIG_HOME: blocker } };
    expect(() => UserConfig.load(blocked).saveChoices({ codex: "update" }, blocked)).not.toThrow();
  });
});