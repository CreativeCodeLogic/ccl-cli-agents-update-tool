import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { helpText } from "../src/utils/args";

describe("README usage block", () => {
  it("shows exactly the options and keys of `ccl-caut --help`", () => {
    const help = helpText("1.2.0", false);
    const options = help.slice(help.indexOf("  --check"), help.indexOf("\n\nExit codes:"));
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(readme).toContain(`ccl-caut [options]\n\n${options}\n`);
  });
});