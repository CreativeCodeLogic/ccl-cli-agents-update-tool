import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertNoRepoLinks, buildNpmReadme, currentNpmReadme } from "../scripts/npm-readme.mjs";
import { findNpmAncestor } from "../scripts/pack-readme.mjs";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json")) as { version: string; repository?: unknown; bugs?: unknown; files: string[] };

describe("npm README", () => {
  it("is in sync with README.md (run: npm run readme:npm)", () => {
    expect(read("README.npm.md")).toBe(currentNpmReadme());
  });

  it("has no links into the private repository and no relative paths", () => {
    expect(() => assertNoRepoLinks(read("README.npm.md"))).not.toThrow();
    expect(() => assertNoRepoLinks("see [roadmap](ROADMAP.md)")).toThrow(/relative link ROADMAP.md/);
    expect(() => assertNoRepoLinks("https://github.com/CreativeCodeLogic/x/issues")).toThrow(/github/);
    expect(() => assertNoRepoLinks('<img src="docs/demo.gif">')).toThrow(/relative link/);
  });

  it("pins the demo GIF to the exact package version on jsDelivr, and ships it", () => {
    expect(read("README.npm.md")).toContain(`https://cdn.jsdelivr.net/npm/ccl-caut@${pkg.version}/docs/demo.gif`);
    expect(buildNpmReadme(read("README.md"), "9.9.9")).toContain("ccl-caut@9.9.9/docs/demo.gif");
    expect(pkg.files).toContain("docs/demo.gif");
  });

  it("keeps the user-facing sections and drops the repo-only ones", () => {
    const text = read("README.npm.md");
    for (const heading of ["## Quick start", "## Supported tools", "## Safe by design", "## Usage", "### Privacy & network", "### Exit codes", "### JSON output", "## Feedback", "## License"]) {
      expect(text).toContain(heading);
    }
    for (const gone of ["## Adding a new tool", "## Roadmap", "CONTRIBUTING", "TESTING", "git clone", "From source"]) {
      expect(text).not.toContain(gone);
    }
    expect(text).toContain("Twelve CLIs. Ten ways to install them. One checklist.");
    expect(text).toContain("mailto:admin@creativecodelogic.com");
    expect(text).toContain("Built by [Creative Code Logic](https://creativecodelogic.com)");
  });

  it("README.md is the repo README, never the swapped npm one", () => {
    expect(read("README.md")).not.toBe(read("README.npm.md"));
    expect(read("README.md")).toContain("## Adding a new tool");
  });

  it("package.json has no repository or bugs links while the repo is private", () => {
    expect(pkg.repository).toBeUndefined();
    expect(pkg.bugs).toBeUndefined();
  });
});

describe("pack README trap", () => {
  it("finds the npm process above the lifecycle shell (Windows and POSIX)", () => {
    const win = [
      { pid: 1, ppid: 0, cmd: "C:\\WINDOWS\\system32\\cmd.exe /k" },
      { pid: 2, ppid: 1, cmd: '"C:\\Program Files\\nodejs\\node.exe" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" pack' },
      { pid: 3, ppid: 2, cmd: "C:\\WINDOWS\\system32\\cmd.exe /d /s /c node scripts/pack-readme.mjs swap" },
      { pid: 4, ppid: 3, cmd: "node scripts/pack-readme.mjs swap" },
    ];
    expect(findNpmAncestor(win, 4)).toBe(2);
    const posix = [
      { pid: 10, ppid: 1, cmd: "npm publish --access public" },
      { pid: 11, ppid: 10, cmd: "sh -c node scripts/pack-readme.mjs swap" },
      { pid: 12, ppid: 11, cmd: "node scripts/pack-readme.mjs swap" },
    ];
    expect(findNpmAncestor(posix, 12)).toBe(10);
  });

  it("never mistakes a path that merely contains an npm folder for npm", () => {
    const table = [
      { pid: 1, ppid: 0, cmd: "/bin/bash" },
      { pid: 2, ppid: 1, cmd: "node /home/jane/.npm/_npx/abc/node_modules/x/cli.js" },
      { pid: 3, ppid: 2, cmd: "node scripts/pack-readme.mjs swap" },
    ];
    expect(findNpmAncestor(table, 3)).toBeNull();
  });
});