import { PassThrough, Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { headerLine } from "../src/ui/banner";
import { fitStepLine } from "../src/ui/progress";
import { checklist, choose } from "../src/ui/prompts";
import { fitHint, fitNames } from "../src/ui/rows";
import { icons } from "../src/ui/symbols";
import { tone } from "../src/ui/theme";
import { displayWidth } from "../src/ui/width";

const WIDTHS = [60, 80, 95, 120];
const plain = (s: string) => stripVTControlCharacters(s);
const arrow = icons.arrow;

// The rows as index.ts builds them (label: name and versions; hint: how it updates, state, admin).
const OPTIONS = [
  { value: "ccl-caut", label: `CCL CAUT  1.2.0-beta.4 ${arrow} 1.2.0-beta.5`, hint: "runs automatically", group: "CCL CAUT" },
  { value: "codex", label: `Codex CLI  0.164.0 ${arrow} 0.165.0`, hint: "runs automatically", group: "AI agents" },
  { value: "cursor", label: `Cursor CLI  2026.10.01 ${arrow} latest`, hint: "updates itself: runs its own updater", group: "AI agents" },
  { value: "gemini", label: `Gemini CLI  0.64.0 ${arrow} 0.66.0`, hint: `retired, opt-in · runs automatically · ${tone.action("needs admin")}`, group: "AI agents" },
  { value: "amp", label: `Amp  0.0.1793145649-gaedc46 ${arrow} 0.0.1793160055-gbd79f2`, hint: "runs automatically", group: "AI agents" },
  { value: "cjk", label: `命令行工具  1.0.0 ${arrow} 1.1.0`, hint: `manual: command will be shown · ${tone.action("needs admin")}`, group: "Dev CLIs" },
  { value: "gcloud", label: `Google Cloud CLI  590.0.1 ${arrow} 591.0.0`, hint: `manual: command will be shown · ${tone.action("needs admin")}`, group: "Dev CLIs" },
];

class Screen extends Writable {
  text = "";
  readonly isTTY = true;
  constructor(public columns: number) {
    super();
  }
  override _write(chunk: Buffer, _e: string, done: () => void) {
    this.text += String(chunk);
    done();
  }
}

function typed(...sequence: string[]) {
  const input = new PassThrough();
  setTimeout(async () => {
    for (const k of sequence) {
      input.write(k);
      await new Promise((r) => setTimeout(r, 15));
    }
  }, 20);
  return input;
}

const lines = (screen: Screen) => plain(screen.text).split(/\r?\n/).filter((l) => l.trim());

describe("hint priority when a checklist row is too wide", () => {
  const gcloud = `manual: command will be shown · ${tone.action("needs admin")}`;
  const gemini = `retired, opt-in · runs automatically · ${tone.action("needs admin")}`;

  it("fits: unchanged (colors kept)", () => {
    expect(fitHint(gcloud, 60)).toBe(gcloud);
  });

  it("1) short forms of the least important parts first: 'manual', 'auto', then 'retired'", () => {
    expect(plain(fitHint(gcloud, 25))).toBe("manual · needs admin");
    expect(plain(fitHint(gemini, 40))).toBe("retired, opt-in · auto · needs admin");
    expect(plain(fitHint(gemini, 30))).toBe("retired · auto · needs admin");
  });

  it("2) then those parts go (how it updates first, then the state): 'needs admin' outranks them", () => {
    expect(plain(fitHint(gcloud, 15))).toBe("needs admin");
    expect(plain(fitHint(gemini, 22))).toBe("retired · needs admin");
    expect(plain(fitHint(gemini, 12))).toBe("needs admin");
    // 'needs admin' keeps its highlight.
    expect(fitHint(gcloud, 15)).toBe(tone.action("needs admin"));
  });

  it("3) 'needs admin' shortens to 'admin' last, then a cut with the ellipsis", () => {
    expect(plain(fitHint(gcloud, 8))).toBe("admin");
    expect(plain(fitHint("updates itself: runs its own updater", 10))).toBe(`updates i${icons.ellipsis}`.slice(0, 10 - icons.ellipsis.length) + icons.ellipsis);
    expect(fitHint(gcloud, 2)).toBe("");
  });
});

describe("checklist rows fit the window (one row each, name and versions kept)", () => {
  for (const width of WIDTHS) {
    it(`${width} columns`, async () => {
      const out = new Screen(width);
      await checklist({ message: "Select the CLIs to update", hint: "Selection remembered from your last run · --reset-selection to clear", options: OPTIONS, initialValues: ["ccl-caut", "codex", "gemini", "gcloud", "cjk"], input: typed("q"), output: out } as never);
      const all = lines(out);
      for (const line of all) expect(displayWidth(line), line).toBeLessThan(width);
      for (const o of OPTIONS.filter((o) => o.value !== "amp" || width > 60)) expect(all.some((l) => l.includes(plain(o.label))), o.label).toBe(true);
      const gcloud = all.find((l) => l.includes("Google Cloud CLI"))!;
      expect(gcloud).toMatch(/needs admin|admin/);
      if (width >= 95) expect(gcloud).toContain("needs admin");
      if (width >= 120) expect(gcloud).toContain("manual: command will be shown · needs admin");
    });
  }

  it("the collapsed answer lists as many names as fit, then '+N more'", async () => {
    expect(fitNames(["CCL CAUT", "Codex CLI", "Gemini CLI", "Google Cloud CLI", "Netlify CLI"], 40)).toBe("CCL CAUT, Codex CLI, Gemini CLI, +2 more");
    const out = new Screen(60);
    await checklist({ message: "Select the CLIs to update", options: OPTIONS, initialValues: OPTIONS.map((o) => o.value), input: typed("\r"), output: out } as never);
    const answer = lines(out).at(-1)!;
    expect(displayWidth(answer)).toBeLessThan(60);
    expect(answer).toMatch(/\+\d+ more$/);
  });
});

describe("other prompt lines fit too", () => {
  for (const width of WIDTHS) {
    it(`picker rows, a long question and the key hints at ${width} columns`, async () => {
      const out = new Screen(width);
      const options = [
        { value: "update", label: "Update now" },
        { value: "skip", label: "Update now, but skip Claude Code (the running session locks its files, or the session may keep using the old version)" },
        { value: "recheck", label: "Re-check" },
        { value: "quit", label: "Quit" },
      ];
      await choose({ message: "Checked again: Codex CLI and Claude Code are still running (3 processes). Update anyway?", options, initialValue: "skip", retry: true, input: typed("\r"), output: out } as never);
      for (const line of lines(out)) expect(displayWidth(line), line).toBeLessThan(width);
      expect(lines(out).join("\n")).toContain("Update anyway?");
    });

    it(`header line and the scan step line at ${width} columns`, () => {
      expect(displayWidth(headerLine("1.2.0-beta.5", (s) => s, width - 1))).toBeLessThan(width);
      const step = fitStepLine("Found 8 of 23 supported CLIs · ccl-caut --discover to see all", width - 1);
      expect(displayWidth(step) + 3).toBeLessThan(width);
      expect(step).toContain("Found 8 of 23 supported CLIs");
    });
  }

  it("the --discover hint is dropped, not cut, when it doesn't fit", () => {
    expect(fitStepLine("Found 8 of 23 supported CLIs · ccl-caut --discover to see all", 59)).toBe("Found 8 of 23 supported CLIs");
    expect(fitStepLine("Found 8 of 23 supported CLIs · ccl-caut --discover to see all", 119)).toContain("--discover");
  });
});
