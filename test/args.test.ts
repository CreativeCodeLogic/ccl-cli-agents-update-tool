import { describe, expect, it } from "vitest";
import { helpText, parseArgs } from "../src/utils/args";

describe("parseArgs", () => {
  it("defaults to the interactive flow", () => {
    expect(parseArgs([])).toEqual({
      ok: true,
      options: { only: null, hideGroup: null, showGroup: null, output: null, force: false, check: false, json: false, refresh: false, discover: false, doctor: false, pending: false, whatsNew: null, hideWhatsNew: false, showWhatsNew: false, noClear: false, resetSelection: false, yes: false, demo: false, help: false, version: false },
    });
  });

  it("parses every flag", () => {
    const parsed = parseArgs(["--check", "--json", "--refresh", "--discover", "--doctor", "--pending", "--no-clear", "--reset-selection", "-y", "--demo", "--no-color", "-h", "-v"]);
    expect(parsed).toEqual({
      ok: true,
      options: { only: null, hideGroup: null, showGroup: null, output: null, force: false, check: true, json: true, refresh: true, discover: true, doctor: true, pending: true, whatsNew: null, hideWhatsNew: false, showWhatsNew: false, noClear: true, resetSelection: true, yes: true, demo: true, help: true, version: true },
    });
  });

  it("parses the group flags (space or =) and rejects other values", () => {
    expect(parseArgs(["--only", "dev"])).toMatchObject({ ok: true, options: { only: "dev" } });
    expect(parseArgs(["--only=agents"])).toMatchObject({ ok: true, options: { only: "agents" } });
    expect(parseArgs(["--hide-group", "dev", "--show-group", "agents"])).toMatchObject({ ok: true, options: { hideGroup: "dev", showGroup: "agents" } });
    expect(parseArgs(["--only"])).toEqual({ ok: false, error: "--only needs a group: agents or dev" });
    expect(parseArgs(["--only", "games"])).toEqual({ ok: false, error: "--only needs a group: agents or dev" });
    expect(parseArgs(["--hide-group", "dev", "--show-group", "dev"])).toEqual({ ok: false, error: "--hide-group and --show-group both name dev" });
  });

  it("parses --whats-new <tool> (space or =) and the hide/show flags", () => {
    expect(parseArgs(["--whats-new", "codex"])).toMatchObject({ ok: true, options: { whatsNew: "codex" } });
    expect(parseArgs(["--whats-new=ccl-caut", "--json"])).toMatchObject({ ok: true, options: { whatsNew: "ccl-caut", json: true } });
    expect(parseArgs(["--whats-new"])).toEqual({ ok: false, error: "--whats-new needs a tool id (e.g. --whats-new codex)" });
    expect(parseArgs(["--whats-new", "--json"])).toEqual({ ok: false, error: "--whats-new needs a tool id (e.g. --whats-new codex)" });
    expect(parseArgs(["--hide-whats-new"])).toMatchObject({ ok: true, options: { hideWhatsNew: true, showWhatsNew: false } });
    expect(parseArgs(["--show-whats-new"])).toMatchObject({ ok: true, options: { hideWhatsNew: false, showWhatsNew: true } });
    expect(parseArgs(["--hide-whats-new", "--show-whats-new"])).toEqual({ ok: false, error: "--hide-whats-new and --show-whats-new can't be used together" });
    const help = helpText("1.3.0");
    for (const flag of ["--whats-new <tool>", "--hide-whats-new", "--show-whats-new", "n what's new"]) expect(help).toContain(flag);
  });

  it("rejects unknown options", () => {
    expect(parseArgs(["--chek"])).toEqual({ ok: false, error: "Unknown option: --chek" });
  });

  it("documents flags and exit codes in --help", () => {
    const text = helpText("1.2.3");
    expect(text).toContain("ccl-caut v1.2.3");
    for (const flag of ["--check", "--json", "--refresh", "--discover", "--doctor", "--pending", "HTTPS_PROXY", "NO_PROXY", "--yes", "--reset-selection", "--no-clear", "--no-color", "CCL_CAUT_NO_UPDATE_CHECK"]) expect(text).toContain(flag);
    expect(text).toContain("130");
    expect(text).not.toContain("--demo");
  });
});