import { PassThrough, Writable } from "node:stream";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";
import { preflightQuestion } from "../src/ui/preflight";
import { choose, QUIT, RESCAN } from "../src/ui/prompts";

function io(...sequence: string[]) {
  const input = new PassThrough();
  let drawn = "";
  const output = new Writable({
    write: (chunk, _e, cb) => {
      drawn += String(chunk);
      cb();
    },
  });
  setTimeout(async () => {
    for (const k of sequence) {
      input.write(k);
      await new Promise((r) => setTimeout(r, 15));
    }
  }, 20);
  return { input, output, drawn: () => stripVTControlCharacters(drawn) };
}

const whatNext = [
  { value: "rescan", label: "Rescan" },
  { value: "quit", label: "Quit" },
];

describe('"What next?": r rescan · q quit', () => {
  it("r rescans, q quits, and the footer says so", async () => {
    const r = io("r");
    expect(await choose({ message: "What next?", options: whatNext, initialValue: "quit", rescan: true, ...r })).toBe(RESCAN);
    expect(r.drawn()).toContain("↑/↓ move · enter confirm · r rescan · q quit");
    const q = io("q");
    expect(await choose({ message: "What next?", options: whatNext, initialValue: "quit", rescan: true, ...q })).toBe(QUIT);
  });

  it("arrows and enter still pick Rescan", async () => {
    const k = io("\x1b[A", "\r");
    expect(await choose({ message: "What next?", options: whatNext, initialValue: "quit", rescan: true, ...k })).toBe("rescan");
  });

  it("after a self-update: no rescan, no r hint, r does nothing", async () => {
    const k = io("r", "q");
    expect(await choose({ message: "What next?", options: [{ value: "quit", label: "Quit" }], initialValue: "quit", rescan: false, ...k })).toBe(QUIT);
    expect(k.drawn()).not.toContain("r rescan");
  });
});

describe('one "Ready to update?" per update round', () => {
  it("asks it once; after Re-check the follow-up says what the check found", () => {
    expect(preflightQuestion(0, ["Codex CLI"])).toBe("Ready to update?");
    expect(preflightQuestion(1, ["Codex CLI"])).toBe("Checked again: Codex CLI is still running. Update anyway?");
    expect(preflightQuestion(2, ["Codex CLI", "Kimi Code"])).toBe("Checked again: Codex CLI and Kimi Code are still running. Update anyway?");
    expect(preflightQuestion(1, [])).toBe("Checked again: none of them is running now. Update now?");
    for (let check = 1; check < 4; check++) expect(preflightQuestion(check, ["x"])).not.toBe("Ready to update?");
  });
});