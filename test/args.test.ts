import { describe, expect, it } from "vitest";
import { helpText, parseArgs } from "../src/utils/args";

describe("parseArgs", () => {
  it("defaults to the interactive flow", () => {
    expect(parseArgs([])).toEqual({
      ok: true,
      options: { check: false, json: false, refresh: false, discover: false, doctor: false, noClear: false, resetSelection: false, yes: false, demo: false, help: false, version: false },
    });
  });

  it("parses every flag", () => {
    const parsed = parseArgs(["--check", "--json", "--refresh", "--discover", "--doctor", "--no-clear", "--reset-selection", "-y", "--demo", "--no-color", "-h", "-v"]);
    expect(parsed).toEqual({
      ok: true,
      options: { check: true, json: true, refresh: true, discover: true, doctor: true, noClear: true, resetSelection: true, yes: true, demo: true, help: true, version: true },
    });
  });

  it("rejects unknown options", () => {
    expect(parseArgs(["--chek"])).toEqual({ ok: false, error: "Unknown option: --chek" });
  });

  it("documents flags and exit codes in --help", () => {
    const text = helpText("1.2.3");
    expect(text).toContain("ccl-caut v1.2.3");
    for (const flag of ["--check", "--json", "--refresh", "--discover", "--doctor", "HTTPS_PROXY", "NO_PROXY", "--yes", "--reset-selection", "--no-clear", "--no-color", "CCL_CAUT_NO_UPDATE_CHECK"]) expect(text).toContain(flag);
    expect(text).toContain("130");
    expect(text).not.toContain("--demo");
  });
});