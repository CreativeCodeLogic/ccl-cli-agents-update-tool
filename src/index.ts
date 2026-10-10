import { cancel, confirm, intro, isCancel, log, multiselect, outro } from "@clack/prompts";
import pc from "picocolors";
import pkg from "../package.json" with { type: "json" };
import { createDemoRuntime } from "./demo/runtime";
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
import { detectInstallContext, nodeModulesParent, selfCheckEnabled, selfUpdateNotice, type InstallContext } from "./self";
import { initialSelection, isOffered, recordSelection, type SelectionStore } from "./selection";
import type { ToolDescriptor, ToolScan } from "./types";
import { printBanner } from "./ui/banner";
import { CANCEL_EXIT_CODE, CANCEL_MESSAGE, createProgress } from "./ui/progress";
import { displayVersion } from "./ui/format";
import { icons } from "./ui/symbols";
import { clearScreenKeepScrollback, shouldClearScreen } from "./ui/screen";
import { printNotes, renderTable } from "./ui/table";
import { applyUpdates, type UpdateExecutor, type UpdateTarget } from "./ui/update";
import { helpText, parseArgs, type CliOptions } from "./utils/args";
import { VersionCache } from "./utils/cache";
import { UserConfig } from "./utils/config";
import { getHost, pathFor, type Host } from "./utils/host";
import { fetchLatestNpmVersion } from "./utils/npm";

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
  /** Remembered selections (the demo keeps them in memory). */
  selections: SelectionStore;
  /** Undefined = run update commands for real. */
  executor?: UpdateExecutor;
  /** Demo only: a canned "newer ccl-caut" result, no network. */
  selfFixture?: { latest: string; context: InstallContext };
}

/** Cache key of ccl-caut's own latest version (shares the 1h latest-version cache). */
const SELF_KEY = "ccl-caut:self";

interface SelfCheck {
  /** Latest version known without waiting (cache or demo fixture). */
  immediate: string | null;
  /** Latest version if the background lookup has finished by now; never awaited. */
  settled(): string | null;
  context: InstallContext | null;
}

/**
 * Look up ccl-caut's own latest version in the background. It is never awaited,
 * so it adds no time to a run: a cached value shows up under the banner, a fresh
 * one after the table if it arrived by then, otherwise next run (it is cached).
 */
function startSelfCheck(runtime: Runtime): SelfCheck {
  if (runtime.selfFixture) {
    const { latest, context } = runtime.selfFixture;
    return { immediate: latest, settled: () => latest, context };
  }
  if (!selfCheckEnabled(process.env)) return { immediate: null, settled: () => null, context: null };

  const { host } = runtime;
  const entryPath = host.fs.realpath(process.argv[1] ?? "");
  const parent = nodeModulesParent(entryPath, host.platform);
  const insideProject = parent !== null && host.fs.exists(pathFor(host.platform).join(parent, "package.json"));
  const context = detectInstallContext({ entryPath, env: process.env, insideProject, platform: host.platform });
  if (context === "source") return { immediate: null, settled: () => null, context };

  let latest: string | null = null;
  void runtime.latest.getByKey(SELF_KEY, () => fetchLatestNpmVersion("ccl-caut"), false).then((v) => {
    latest = v;
  });
  return { immediate: runtime.latest.peek(SELF_KEY), settled: () => latest, context };
}

function createRuntime(options: CliOptions): Runtime {
  if (options.demo) return createDemoRuntime();
  return {
    tools: registry,
    host: getHost(),
    latest: new LatestResolver(VersionCache.load(), options.refresh),
    selections: UserConfig.load(),
  };
}

function exitCancelled(): never {
  cancel(CANCEL_MESSAGE);
  process.exit(CANCEL_EXIT_CODE);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** CI semantics for --check: 0 = all current, 1 = updates exist. */
const checkExitCode = (summary: ScanSummary) => (summary.outdated > 0 ? 1 : 0);

function scanVerdict({ outdated, upToDate, unknown, retired, selfUpdating }: ScanSummary): string {
  const extras = [
    retired > 0 ? `${retired} retired` : "",
    selfUpdating > 0 ? `${selfUpdating} updating itself` : "",
    unknown > 0 ? `${unknown} could not be checked` : "",
  ]
    .filter(Boolean)
    .map((part) => pc.gray(`, ${part}`))
    .join("");
  if (outdated > 0) {
    return pc.yellow(`${plural(outdated, "update")} available`) + pc.dim(`, ${upToDate} up-to-date`) + extras;
  }
  if (extras) return pc.green(`No updates found`) + pc.dim(` (${upToDate} up-to-date`) + extras + pc.dim(")");
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
  const self = startSelfCheck(runtime);
  const { results } = await scan(runtime);
  const summary = summarize(results);
  const { latest } = runtime;
  const report = {
    tool: "ccl-caut",
    version: VERSION,
    self: { version: VERSION, latest: self.settled() ?? self.immediate },
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

/** Banner + two progress phases + table + notes. Shared by --check and the interactive flow. */
async function scanWithProgress(runtime: Runtime, showAll: boolean): Promise<ScanResult> {
  const { tools, host, latest } = runtime;
  const self = startSelfCheck(runtime);
  const bannerNotice = selfUpdateNotice(VERSION, self.immediate, self.context);
  printBanner(VERSION, bannerNotice);
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

  console.log(`${pc.gray("│")}\n${renderTable(results, showAll)}`);
  printNotes(results, showAll);
  const lateNotice = bannerNotice ? null : selfUpdateNotice(VERSION, self.settled(), self.context);
  if (lateNotice) log.message(pc.dim(lateNotice));
  if (latest.oldestCachedAt !== null) {
    const age = formatAge(Date.now() - latest.oldestCachedAt);
    log.message(pc.dim(`Latest versions cached ${age} ago · --refresh to recheck`));
  }
  return { results, detections };
}

async function runCheck(runtime: Runtime, showAll: boolean): Promise<number> {
  const { results } = await scanWithProgress(runtime, showAll);
  const summary = summarize(results);
  outro(scanVerdict(summary));
  return checkExitCode(summary);
}

function optionHint(r: ToolScan): string {
  if (r.state === "self-updating") return "updates itself: runs its own updater";
  const kind = r.plan?.kind === "auto" ? "runs automatically" : "manual: command will be shown";
  return r.state === "retired" ? `retired, opt-in · ${kind}` : kind;
}

function optionLabel(r: ToolScan): string {
  const latest = r.state === "self-updating" ? pc.dim("latest") : pc.green(r.latestVersion ? displayVersion(r.latestVersion) : "?");
  return `${r.name}  ${pc.dim(r.installedVersion ? displayVersion(r.installedVersion) : "?")} ${icons.arrow} ${latest}`;
}

/**
 * Updating Claude Code from inside a Claude Code session: the running session
 * may lock its files (Windows) or keep running the old version. Ask first;
 * with --yes there is nobody to ask, so it is skipped.
 */
async function guardClaudeSelfUpdate(targets: UpdateTarget[], nonInteractive: boolean): Promise<UpdateTarget[]> {
  const claude = targets.find((t) => t.scan.id === "claude" && t.scan.plan?.kind === "auto");
  if (!claude || !process.env.CLAUDECODE) return targets;
  const risk = "the running session locks its files, or the session may keep using the old version";
  if (nonInteractive) {
    log.warn(`Skipping Claude Code: ccl-caut is running inside a Claude Code session (${risk}). Run it from another terminal.`);
    return targets.filter((t) => t !== claude);
  }
  log.warn(`ccl-caut is running inside a Claude Code session. Updating Claude Code now may fail because ${risk}.`);
  const ok = await confirm({ message: "Update Claude Code anyway?", initialValue: false });
  if (isCancel(ok)) exitCancelled();
  return ok ? targets : targets.filter((t) => t !== claude);
}

async function runInteractive(runtime: Runtime, options: CliOptions): Promise<number> {
  const { results, detections } = await scanWithProgress(runtime, options.showAll);
  const summary = summarize(results);
  const offered = results.filter(isOffered);

  if (offered.length === 0) {
    outro(scanVerdict(summary));
    return 0;
  }

  const initial = initialSelection(offered, runtime.selections.toolChoices);
  let picked: string[];
  if (options.yes) {
    picked = initial.ids;
    const names = offered.filter((r) => picked.includes(r.id)).map((r) => r.shortName);
    log.info(names.length > 0 ? `--yes: updating ${names.join(", ")}` : "--yes: nothing is selected by default");
  } else {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      outro(`${scanVerdict(summary)}${pc.dim(". Run in an interactive terminal (or with --yes) to apply updates.")}`);
      return 0;
    }
    const hint = initial.remembered ? `\n${pc.dim("Selection remembered from your last run · --reset-selection to clear")}` : "";
    const answer = await multiselect({
      message: `Select the CLIs to update${hint}`,
      options: offered.map((r) => ({ value: r.id, label: optionLabel(r), hint: optionHint(r) })),
      initialValues: initial.ids,
      required: false,
    });
    if (isCancel(answer)) exitCancelled();
    picked = answer;
    runtime.selections.saveChoices(recordSelection(runtime.selections.toolChoices, offered, picked));
  }

  let targets: UpdateTarget[] = [];
  for (const scan of offered) {
    const detection = detections.find((d) => d.tool.id === scan.id);
    const instance = detection?.instances[0];
    if (picked.includes(scan.id) && detection && instance) targets.push({ scan, tool: detection.tool, instance });
  }
  targets = await guardClaudeSelfUpdate(targets, options.yes);
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
  if (outcome.current > 0) parts.push(pc.dim(`${outcome.current} already current`));
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
  if (options.resetSelection) runtime.selections.reset();
  if (options.json) return runJson(runtime, options.check);
  if (options.check) return runCheck(runtime, options.showAll);

  const interactive = !options.yes;
  const clear = { interactive, isTTY: Boolean(process.stdout.isTTY), env: process.env, noClear: options.noClear, demo: options.demo };
  if (shouldClearScreen(clear)) clearScreenKeepScrollback();

  // Ctrl+C outside a prompt (e.g. during a scan) exits cleanly too.
  process.once("SIGINT", exitCancelled);
  return runInteractive(runtime, options);
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