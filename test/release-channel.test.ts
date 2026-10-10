import { describe, expect, it } from "vitest";
import { classifyTag } from "../scripts/release-channel.mjs";

describe("release tag channels", () => {
  it.each([
    ["v1.0.0", "stable", true],
    ["v1.2.10", "stable", true],
    ["v1.0.0-rc.1", "rc", false],
    ["v1.0.0-rc.12", "rc", false],
    ["v1.1.0-beta.1", "beta", true],
    ["v2.0.0-next.3", "beta", true],
  ] as const)("%s -> %s (npm publish: %s)", (tag, channel, publishToNpm) => {
    expect(classifyTag(tag)).toEqual({ channel, version: tag.slice(1), publishToNpm });
  });

  it.each(["v1.0.0-rc1", "v1.0.0-RC.1", "v1.0.0-rc.1.1", "v1.0.0-rc", "v1.0.0-pre-rc.1"])(
    "never lets a malformed rc tag (%s) reach a publishing channel",
    (tag) => {
      expect(classifyTag(tag)).toBeNull();
    },
  );

  it.each(["1.0.0", "v1.0", "v1.0.0.0", "release-1.0.0", "v1.0.0-", "v1.0.0+build.1"])("rejects %s", (tag) => {
    expect(classifyTag(tag)).toBeNull();
  });

  it("never publishes release candidates", () => {
    for (const n of [1, 2, 9, 10]) expect(classifyTag(`v1.0.0-rc.${n}`)?.publishToNpm).toBe(false);
  });
});