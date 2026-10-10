import { cancel, intro, isCancel, multiselect, outro } from "@clack/prompts";
import pc from "picocolors";
import pkg from "../package.json" with { type: "json" };
import { registry } from "./registry";
import { detectAll, prefetchLatest, resolveLatest, summarize, type ScanSummary } from "./scan";
import type { ToolScan } from "./types";
import { printBanner } from "./ui/banner";
import { CANCEL_EXIT_CODE, CANCEL_MESSAGE, createProgress } from "./ui/progress";
import { icons } from "./ui/symbols";
import { renderTable } from "./ui/table";
import { applyUpdates } from "./ui/update";
import { helpText, parseArgs } from "./utils/args";

const VERSION = pkg.version;

function exitCancelled(): never {
  cancel(CANCEL_MESSAGE);
  process.exit(CANCEL_EXIT_CODE);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function scanVerdict({ outdated, upToDate, unknown }: ScanSummary): string {
  const unchecked = unknown > 0 ? pc.gray(`, ${unknown} could not be checked`) : "";
  if (outdated > 0) {
    return pc.yellow(`${plural(outdated, "update")} available`) + pc.dim(`, ${upToDate} up-to-date`) + unchecked;
  }
  if (unknown > 0) return pc.green(`No updates found`) + pc.dim(` (${upToDate} up-to-date`) + unchecked + pc.dim(")");
  return pc.green(`Everything is up-to-date (${upToDate})`);
}

async function scan(): Promise<ToolScan[]> {
  prefetchLatest(registry);
  return resolveLatest(await detectAll(registry));
}

async function runJson(): Promise<number> {
  const results = await scan();
  const report = {
    tool: "ccl-aut",
    version: VERSION,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    summary: summarize(results),
    tools: results,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return 0;
}

/** Banner + two progress phases + table. Shared by --check and the interactive flow. */
async function scanWithProgress(): Promise<ToolScan[]> {
  printBanner(VERSION);
  intro(pc.inverse(" Scan "));
  prefetchLatest(registry);

  const progress = createProgress();
  progress.start("Scanning for installed CLIs...");
  const detections = await detectAll(registry);
  const found = detections.filter((d) => d.installMethod).length;
  progress.stop(`Found ${found} of ${detections.length} supported CLIs`);

  progress.start("Checking latest versions...");
  const results = await resolveLatest(detections);
  progress.stop("Latest versions checked");

  console.log(`${pc.gray("│")}\n${renderTable(results)}`);
  return results;
}

async function runCheck(): Promise<number> {
  const results = await scanWithProgress();
  const summary = summarize(results);
  outro(scanVerdict(summary));
  // CI semantics: 0 = all current, 1 = updates exist.
  return summary.outdated > 0 ? 1 : 0;
}

async function runInteractive(): Promise<number> {
  const results = await scanWithProgress();
  const summary = summarize(results);
  const outdated = results.filter((r) => r.state === "outdated" && r.plan);

  if (outdated.length === 0) {
    outro(scanVerdict(summary));
    return 0;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    outro(`${scanVerdict(summary)}${pc.dim(". Run in an interactive terminal to apply updates.")}`);
    return 0;
  }

  const picked = await multiselect({
    message: "Select the CLIs to update",
    options: outdated.map((r) => ({
      value: r.id,
      label: `${r.name}  ${pc.dim(r.installedVersion ?? "?")} ${icons.arrow} ${pc.green(r.latestVersion ?? "?")}`,
      hint: r.plan?.kind === "auto" ? "runs automatically" : "manual: command will be shown",
    })),
    initialValues: outdated.map((r) => r.id),
    required: false,
  });
  if (isCancel(picked)) exitCancelled();

  const selected = outdated.filter((r) => picked.includes(r.id));
  if (selected.length === 0) {
    outro(pc.dim("Nothing selected — no changes made."));
    return 0;
  }

  const descriptors = new Map(registry.map((t) => [t.id, t]));
  process.off("SIGINT", exitCancelled); // applyUpdates handles Ctrl+C from here on
  const outcome = await applyUpdates(selected, descriptors);

  const parts = [
    pc.green(`${outcome.updated} updated`),
    pc.cyan(`${outcome.manual} manual`),
    pc.dim(`${summary.upToDate} up-to-date`),
  ];
  if (outcome.failed > 0) parts.push(pc.red(`${outcome.failed} failed`));
  outro(parts.join(pc.dim(", ")));
  if (outcome.interrupted) return CANCEL_EXIT_CODE;
  return outcome.failed > 0 ? 1 : 0;
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n\n${helpText(VERSION)}`);
    return 2;
  }
  const { options } = parsed;

  if (options.help) {
    process.stdout.write(helpText(VERSION));
    return 0;
  }
  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (options.json) return runJson();
  if (options.check) return runCheck();

  // Ctrl+C outside a prompt (e.g. during a scan) exits cleanly too.
  process.once("SIGINT", exitCancelled);
  return runInteractive();
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${pc.red(`ccl-aut: ${message}`)}\n`);
    if (process.env.CCL_AUT_DEBUG && error instanceof Error) process.stderr.write(`${error.stack ?? ""}\n`);
    process.exit(1);
  },
);
