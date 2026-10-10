import { unicodeOr } from "@clack/prompts";
import pc from "picocolors";
import type { ToolState } from "../types";

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
  "up-to-date": { icon: pc.green(icons.ok), label: pc.green("up-to-date") },
  outdated: { icon: pc.yellow(icons.update), label: pc.yellow("update available") },
  "not-installed": { icon: pc.dim(icons.missing), label: pc.dim("not installed") },
  unknown: { icon: pc.gray(icons.unknown), label: pc.gray("unknown") },
  retired: { icon: pc.red(icons.retired), label: pc.red("retired") },
  "self-updating": { icon: pc.cyan(icons.selfUpdating), label: pc.dim(pc.cyan("updates itself")) },
};
