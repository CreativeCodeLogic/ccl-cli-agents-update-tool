import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { registry } from "../src/registry";
import type { Detection } from "../src/scan";
import { renderDiscovery } from "../src/ui/discover";

describe("discovery", () => {
  it("gives every supported tool a description and an https official-docs URL", () => {
    expect(registry).toHaveLength(23);
    for (const tool of registry) {
      expect(tool.description.length, tool.id).toBeGreaterThan(10);
      expect(tool.docsUrl, tool.id).toMatch(/^https:[/][/][a-z0-9.-]+[.][a-z]+[/]/);
    }
  });

  it("lists installed and missing tools with their docs, and never an install command", () => {
    const detections: Detection[] = registry.map((tool) => ({
      tool,
      instances: tool.id === "claude" ? [{ path: "/x/claude", realPath: "/x/claude", installMethod: "native", version: "2.1.296" }] : [],
    }));
    const text = stripVTControlCharacters(renderDiscovery(detections));
    for (const tool of registry) {
      expect(text).toContain(tool.name);
      expect(text).toContain(tool.docsUrl);
    }
    expect(text).toContain("2.1.296");
    expect(text.match(/not installed/g)).toHaveLength(22);
    expect(text).not.toMatch(/npm (i|install) |brew install|winget install|curl .*[|] *(ba)?sh|irm .*iex/);
  });
});