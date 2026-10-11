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
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ schema: 2, tools: { codex: "update", gcloud: "skip" }, hiddenGroups: [] });
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

  it("migrates a 1.0 (schema 1) file: keeps the choices, adds hiddenGroups on the next save", () => {
    const { host, file } = tempHost();
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ schema: 1, tools: { codex: "update", kimi: "skip" } }));
    const config = UserConfig.load(host);
    expect(config.toolChoices).toEqual({ codex: "update", kimi: "skip" });
    expect(config.hiddenGroups).toEqual([]);
    config.setGroupHidden("dev", true, host);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ schema: 2, tools: { codex: "update", kimi: "skip" }, hiddenGroups: ["dev"] });
  });

  it("hides and shows groups persistently, ignoring unknown group names", () => {
    const { host, file } = tempHost();
    UserConfig.load(host).setGroupHidden("dev", true, host);
    expect(UserConfig.load(host).hiddenGroups).toEqual(["dev"]);
    UserConfig.load(host).setGroupHidden("dev", false, host);
    expect(UserConfig.load(host).hiddenGroups).toEqual([]);
    writeFileSync(file, JSON.stringify({ schema: 2, tools: {}, hiddenGroups: ["dev", "games", "dev"] }));
    expect(UserConfig.load(host).hiddenGroups).toEqual(["dev"]);
  });

  it("--reset-selection keeps hidden groups", () => {
    const { host, file } = tempHost();
    const config = UserConfig.load(host);
    config.saveChoices({ codex: "skip" }, host);
    config.setGroupHidden("dev", true, host);
    config.reset(host);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ schema: 2, tools: {}, hiddenGroups: ["dev"] });
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