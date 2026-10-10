import { describe, expect, it } from "vitest";
import { nativeVersionFromUpdaterLog } from "../src/registry/kimi";
import { fakeHost, instance, win } from "./helpers";

const home = win("C:/Users/Jane");
const exe = win(`${home}/.kimi-code/bin/kimi.exe`);
const log = win(`${home}/.kimi-code/updates/rollout.log`);
const binaryReplacedAt = Date.parse("2026-07-21T11:17:59Z");

const entry = (ts: string, current: string) =>
  JSON.stringify({ ts, phase: "background-refresh", reason: "not-newer", current, latest: current });

function hostWith(logText: string | undefined, exeMtime = binaryReplacedAt) {
  return fakeHost({
    platform: "win32",
    homedir: home,
    files: [exe],
    texts: logText === undefined ? {} : { [log]: logText },
    mtimes: { [exe]: exeMtime },
  });
}

describe("nativeVersionFromUpdaterLog", () => {
  const native = instance(exe, "native");

  it("reads the version the running binary last recorded", () => {
    const text = [entry("2026-07-20T06:00:00Z", "0.26.0"), entry("2026-07-21T11:18:15Z", "0.28.1"), ""].join("\r\n");
    expect(nativeVersionFromUpdaterLog(native, hostWith(text))).toBe("0.28.1");
  });

  it("ignores an entry written before the binary was replaced (e.g. right after an upgrade)", () => {
    const text = entry("2026-07-21T11:18:15Z", "0.28.1");
    expect(nativeVersionFromUpdaterLog(native, hostWith(text, Date.parse("2026-10-10T09:00:00Z")))).toBeNull();
  });

  it("falls back (null) when the log is missing, corrupt or has no version", () => {
    expect(nativeVersionFromUpdaterLog(native, hostWith(undefined))).toBeNull();
    expect(nativeVersionFromUpdaterLog(native, hostWith("{ not json"))).toBeNull();
    expect(nativeVersionFromUpdaterLog(native, hostWith(JSON.stringify({ ts: "2026-07-21T11:18:15Z" })))).toBeNull();
    expect(nativeVersionFromUpdaterLog(native, hostWith(JSON.stringify({ current: "0.28.1" })))).toBeNull();
  });
});