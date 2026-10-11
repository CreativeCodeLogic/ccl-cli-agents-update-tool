import { describe, expect, it } from "vitest";
import { checkPublishTag } from "../scripts/publish-guard.mjs";
import { selfUpdateNotice } from "../src/self";

describe("prepublishOnly guard", () => {
  it("refuses a prerelease on the latest tag (unset or explicit)", () => {
    expect(checkPublishTag("1.1.0-beta.1", undefined)).toBe("Prerelease version: publish with `npm publish --tag next`");
    expect(checkPublishTag("1.1.0-beta.1", "latest")).toBe("Prerelease version: publish with `npm publish --tag next`");
    expect(checkPublishTag("1.1.0-beta.1", "next")).toBeNull();
  });

  it("refuses a stable version on the next tag", () => {
    expect(checkPublishTag("1.1.0", "next")).toBe("Stable version: publish without --tag next (it goes to latest)");
    expect(checkPublishTag("1.1.0", undefined)).toBeNull();
    expect(checkPublishTag("1.1.0", "latest")).toBeNull();
  });
});

describe("update notice for the beta channel", () => {
  it("points a beta user at the higher of latest and next", () => {
    expect(selfUpdateNotice("1.1.0-beta.1", "1.0.1", "global", "1.1.0-beta.2")).toBe("ccl-caut 1.1.0-beta.2 is available · npm i -g ccl-caut@next");
    expect(selfUpdateNotice("1.1.0-beta.2", "1.1.0", "global", "1.1.0-beta.2")).toBe("ccl-caut 1.1.0 is available · npm i -g ccl-caut");
    expect(selfUpdateNotice("1.1.0-beta.1", "1.0.1", "npx", "1.1.0-beta.3")).toBe("ccl-caut 1.1.0-beta.3 is available · npx ccl-caut@next");
  });

  it("never downgrades a beta user", () => {
    expect(selfUpdateNotice("1.1.0-beta.2", "1.0.1", "global", "1.1.0-beta.2")).toBeNull();
    expect(selfUpdateNotice("1.1.0-beta.2", "1.0.1", "global", "1.1.0-beta.1")).toBeNull();
  });

  it("never points a stable user at a beta", () => {
    expect(selfUpdateNotice("1.0.1", "1.0.1", "global", "1.1.0-beta.2")).toBeNull();
    expect(selfUpdateNotice("1.0.0", "1.0.1", "global", "1.1.0-beta.2")).toBe("ccl-caut 1.0.1 is available · npm i -g ccl-caut");
  });
});
