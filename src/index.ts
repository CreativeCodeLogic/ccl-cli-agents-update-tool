import { cancel, confirm, intro, isCancel, log, multiselect, outro } from "@clack/prompts";
import pc from "picocolors";
import pkg from "../package.json" with { type: "json" };
import { registry } from "./registry";
import {
  detectAll,
  LatestResolver,
  prefetchLatest,
  resolveLatest,
  summarize,
  type Detection,
  type ScanSummary,
} from "./scan";
import { createDemoRuntime } from "./demo/runtime";
import type { ToolDescriptor, ToolScan } from "./types";
import { printBanner } from "./ui/banner";
import { CANCEL_EXIT_CODE, CANCEL_MESSAGE, createProgress } from "./ui/progress";
import { printShadowedWarnings } from "./ui/shadowed";
import { icons } from "./ui/symbols";
import { renderTable } from "./ui/table";
import { applyUpdates, type UpdateExecutor, type UpdateTarget } from "./ui/update";
import { helpText, parseArgs, type CliOptions } from "./utils/args";
import { VersionCache } from "./utils/cache";
import { getHost, type Host } from "./utils/host";

const VERSION = pkg.version;

interface ScanResult {
  results: ToolScan[];
  detections: Detection[];
}

/** What a run works against: the real machine, or the --demo fixture. */
interface Runtime {
  tools: readonly ToolDescriptor[];
  host: Host;
  latest: LatestResolver;
  /** Undefined = run update commands for real. */
  executor?: UpdateExecutor;
}

function createRuntime(options: CliOptions): Runtime {
  if (options.demo) return createDemoRuntime();
  return { tools: registry, host: getHost(), latest: new LatestResolver(VersionCache.load(), options.refresh) };
}

function exitCancelled(): never {
  cancel(CANCEL_MESSAGE);
  process.exit(CANCEL_EXIT_CODE);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** CI semantics for --check: 0 = all current, 1 = updates exist. */
const checkExitCode = (summary: ScanSummary) => (summary.outdated > 0 ? 1 : 0);

function scanVerdict({ outdated, upToDate, unknown }: ScanSummary): string {
  const unchecked = unknown > 0 ? pc.gray(`, ${unknown} could not be checked`) : "";
  if (outdated > 0) {
    return pc.yellow(`${plural(outdated, "update")} available`) + pc.dim(`, ${upToDate} up-to-date`) + unchecked;
  }
  if (unknown > 0) return pc.green(`No updates found`) + pc.dim(` (${upToDate} up-to-date`) + unchecked + pc.dim(")");
  return pc.green(`Everything is up-to-date (${upToDate})`);
}

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  return minutes < 1 ? "less than a minute" : `${minutes}m`;
}

async function scan(runtime: Runtime): Promise<ScanResult> {
  const { tools, host, latest } = runtime;
  prefetchLatest(tools, latest);
  const detections = await detectAll(tools, host);
  const results = await resolveLatest(detections, latest);
  latest.cache?.save();
  return { results, detections };
}

async function runJson(runtime: Runtime, check: boolean): Promise<number> {
  const { results } = await scan(runtime);
  const { latest } = runtime;
  const summary = summarize(results);
  const report = {
    tool: "ccl-caut",
    version: VERSION,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    // Set when some latest versions came from the disk cache (oldest entry used).
    latestCachedAt: latest.oldestCachedAt === null ? null : new Date(latest.oldestCachedAt).toISOString(),
    summary,
    tools: results,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return check ? checkExitCode(summary) : 0;
}

/** Banner + two progress phases + table + warnings. Shared by --check and the interactive flow. */
async function scanWithProgress(runtime: Runtime): Promise<ScanResult> {
  const { tools, host, latest } = runtime;
  printBanner(VERSION);
  intro(pc.inverse(" Scan "));
  prefetchLatest(tools, latest);

  const progress = createProgress();
  progress.start("Scanning for installed CLIs...");
  const detections = await detectAll(tools, host);
  const found = detections.filter((d) => d.instances.length > 0).length;
  progress.stop(`Found ${found} of ${detections.length} supported CLIs`);

  progress.start("Checking latest versions...");
  const results = await resolveLatest(detections, latest);
  latest.cache?.save();
  progress.stop("Latest versions checked");

  console.log(`${pc.gray("│")}\n${renderTable(results)}`);
  printShadowedWarnings(results, new Map(tools.map((t) => [t.id, t.npmPackage])));
  if (latest.oldestCachedAt !== null) {
    const age = formatAge(Date.now() - latest.oldestCachedAt);
    log.message(pc.dim(`Latest versions cached ${age} ago · --refresh to recheck`));
  }
  return { results, detections };
}

async function runCheck(runtime: Runtime): Promise<number> {
  const { results } = await scanWithProgress(runtime);
  const summary = summarize(results);
  outro(scanVerdict(summary));
  return checkExitCode(summary);
}

/**
 * Updating Claude Code from inside a Claude Code session: the running session
 * may lock its files (Windows) or keep running the old version. Ask first.
 */
async function confirmClaudeSelfUpdate(targets: UpdateTarget[]): Promise<UpdateTarget[]> {
  const claude = targets.find((t) => t.scan.id === "claude" && t.scan.plan?.kind === "auto");
  if (!claude || !process.env.CLAUDECODE) return targets;
  log.warn(
    "ccl-caut is running inside a Claude Code session. Updating Claude Code now may fail " +
      "because the running session locks its files, or the session may keep using the old version.",
  );
  const ok = await confirm({ message: "Update Claude Code anyway?", initialValue: false });
  if (isCancel(ok)) exitCancelled();
  return ok ? targets : targets.filter((t) => t !== claude);
}

async function runInteractive(runtime: Runtime): Promise<number> {
  const { results, detections } = await scanWithProgress(runtime);
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

  let targets: UpdateTarget[] = [];
  for (const scan of outdated) {
    const detection = detections.find((d) => d.tool.id === scan.id);
    const instance = detection?.instances[0];
    if (picked.includes(scan.id) && detection && instance) targets.push({ scan, tool: detection.tool, instance });
  }
  targets = await confirmClaudeSelfUpdate(targets);
  if (targets.length === 0) {
    outro(pc.dim("Nothing selected — no changes made."));
    return 0;
  }

  process.off("SIGINT", exitCancelled); // applyUpdates handles Ctrl+C from here on
  const outcome = await applyUpdates(targets, runtime.latest.cache, runtime.executor);

  const parts = [
    pc.green(`${outcome.updated} updated`),
    pc.cyan(`${outcome.manual} manual`),
    pc.dim(`${summary.upToDate} up-to-date`),
  ];
  if (outcome.held > 0) parts.push(pc.yellow(`${outcome.held} held`));
  if (outcome.unchanged > 0) parts.push(pc.yellow(`${outcome.unchanged} unchanged`));
  if (outcome.failed > 0) parts.push(pc.red(`${outcome.failed} failed`));
  outro(parts.join(pc.dim(", ")));
  if (outcome.interrupted) return CANCEL_EXIT_CODE;
  return outcome.failed > 0 || outcome.unchanged > 0 ? 1 : 0;
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
  const runtime = createRuntime(options);
  if (options.json) return runJson(runtime, options.check);
  if (options.check) return runCheck(runtime);

  // Ctrl+C outside a prompt (e.g. during a scan) exits cleanly too.
  process.once("SIGINT", exitCancelled);
  return runInteractive(runtime);
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${pc.red(`ccl-caut: ${message}`)}\n`);
    if (process.env.CCL_CAUT_DEBUG && error instanceof Error) process.stderr.write(`${error.stack ?? ""}\n`);
    process.exit(1);
  },
);
