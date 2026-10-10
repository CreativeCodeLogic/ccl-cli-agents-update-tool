import { unicodeOr } from "@clack/prompts";
import type { ToolState } from "../types";
import { tone } from "./theme";

/** Icons with ASCII fallbacks for terminals without Unicode (clack's own detection). */
export const icons = {
  ok: unicodeOr("✔", "√"),
  update: unicodeOr("↑", "^"),
  missing: unicodeOr("–", "-"),
  unknown: "?",
  arrow: unicodeOr("→", "->"),
  fail: unicodeOr("✖", "x"),
  rule: unicodeOr("─", "-"),
  retired: unicodeOr("⊘", "x"),
  selfUpdating: unicodeOr("↻", "~"),
};

export const stateStyle: Record<ToolState, { icon: string; label: string }> = {
  "up-to-date": { icon: tone.done(icons.ok), label: tone.done("up-to-date") },
  outdated: { icon: tone.action(icons.update), label: tone.action("update available") },
  "not-installed": { icon: tone.muted(icons.missing), label: tone.muted("not installed") },
  unknown: { icon: tone.muted(icons.unknown), label: tone.muted("unknown") },
  retired: { icon: tone.bad(icons.retired), label: tone.bad("retired") },
  "self-updating": { icon: tone.self(icons.selfUpdating), label: tone.self("updates itself") },
};