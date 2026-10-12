import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json")) as {
  repository?: { url: string };
  bugs?: { url: string };
  homepage: string;
  files: string[];
  scripts: Record<string, string>;
};

describe("npm package (public repo)", () => {
  it("links the repository and issues, keeps the website as homepage", () => {
    expect(pkg.repository?.url).toBe("git+https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool.git");
    expect(pkg.bugs?.url).toBe("https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/issues");
    expect(pkg.homepage).toBe("https://creativecodelogic.com");
  });

  it("ships the normal README and no docs/ (the GIF is loaded from GitHub)", () => {
    expect(pkg.files).toEqual(["dist", "README.md", "LICENSE"]);
    for (const script of ["prepack", "postpack", "pretest"]) expect(pkg.scripts[script]).toBeUndefined();
  });

  it("shows the demo GIF from an absolute, pinned GitHub URL", () => {
    const image = /!\[[^\]]*\]\(([^)]+demo\.gif)\)/.exec(read("README.md"))?.[1];
    expect(image).toMatch(/^https:\/\/raw\.githubusercontent\.com\/CreativeCodeLogic\/ccl-cli-agents-update-tool\/([0-9a-f]{40}|v\d+\.\d+\.\d+[^/]*)\/docs\/demo\.gif$/);
  });
});
