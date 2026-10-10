import { describe, expect, it } from "vitest";
import { helpText, parseArgs } from "../src/utils/args";

describe("parseArgs", () => {
  it("defaults to the interactive flow", () => {
    expect(parseArgs([])).toEqual({
      ok: true,
      options: { check: false, json: false, refresh: false, help: false, version: false },
    });
  });

  it("parses every flag", () => {
    const parsed = parseArgs(["--check", "--json", "--refresh", "--no-color", "-h", "-v"]);
    expect(parsed).toEqual({
      ok: true,
      options: { check: true, json: true, refresh: true, help: true, version: true },
    });
  });

  it("rejects unknown options", () => {
    expect(parseArgs(["--chek"])).toEqual({ ok: false, error: "Unknown option: --chek" });
  });

  it("documents flags and exit codes in --help", () => {
    const text = helpText("1.2.3");
    expect(text).toContain("ccl-caut v1.2.3");
    for (const flag of ["--check", "--json", "--refresh", "--no-color"]) expect(text).toContain(flag);
    expect(text).toContain("130");
  });
});