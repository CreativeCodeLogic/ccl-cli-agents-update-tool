import { describe, expect, it } from "vitest";
import { brandColor } from "../src/ui/banner";

const ESC = String.fromCharCode(27);

describe("banner color", () => {
  it("uses 24-bit #53d2ff when truecolor is supported", () => {
    expect(brandColor(24, true)("CCL")).toBe(`${ESC}[38;2;83;210;255mCCL${ESC}[39m`);
  });

  it("falls back to the closest 256-color shade, then bright cyan", () => {
    expect(brandColor(8, true)("CCL")).toBe(`${ESC}[38;5;81mCCL${ESC}[39m`);
    expect(brandColor(4, true)("CCL")).toBe(`${ESC}[96mCCL${ESC}[39m`);
  });

  it("colors every line of the big banner and nothing when colors are off", () => {
    expect(brandColor(24, true)("a\nb").split("\n")).toHaveLength(2);
    expect(brandColor(24, true)("a\nb").split("\n").every((l) => l.startsWith(`${ESC}[38;2;`))).toBe(true);
    expect(brandColor(24, false)("a\nb")).toBe("a\nb");
  });
});
