import { cancel, intro, log, outro } from "@clack/prompts";
import pc from "picocolors";
import pkg from "../package.json" with { type: "json" };
import { createDemoRuntime } from "./demo/runtime";
import { countRunning, listProcesses, processSignatures, splitUnattended, type ProcessInfo } from "./processes";
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
import { createNoticeSlot, detectInstallContext, nodeModulesParent, selfCheckEnabled, type InstallContext } from "./self";
import { initialSelection, isOffered, recordSelection, type SelectionStore } from "./selection";
import type { ToolDescriptor, ToolScan } from "./types";
import { headerStyle, printHeader, type HeaderStyle } from "./ui/banner";
import { CANCEL_EXIT_CODE, CANCEL_MESSAGE, createProgress } from "./ui/progress";
import { displayVersion } from "./ui/format";
import { icons } from "./ui/symbols";
import { clearScreenKeepScrollback, shouldClearScreen } from "./ui/screen";
import { renderDiscovery } from "./ui/discover";
import { INFO_SYMBOL, printNotes, renderTable } from "./ui/table";
import { CANCELLED, checklist, choose, QUIT, RETRY } from "./ui/prompts";
import { getNetwork, networkProblem } from "./utils/http";
import { doctorReport } from "./doctor";
import { realReportDeps, reportPrompt, wantsReportPrompt, writeOutputFile } from "./report";
import { githubRateLimitNotice } from "./utils/github";
import { findProjectManifest, type ProjectManifest } from "./project";
import { GROUP_LABELS, TOOL_GROUPS, type ToolGroup } from "./types";
import { tone } from "./ui/theme";
import { applyUpdates, type UpdateExecutor, type UpdateOutcome, type UpdateTarget } from "./ui/update";
import { helpText, parseArgs, type CliOptions } from "./utils/args";
import { VersionCache } from "./utils/cache";
import { UserConfig } from "./utils/config";
import { detectElevation } from "./utils/elevation";
import { getHost, pathFor, setHost, type Host } from "./utils/host";
import { fetchDistTags } from "./utils/npm";

const VERSION = pkg.version;

interface ScanResult {
  results: ToolScan[];
  detections: Detection[];
  /** "Couldn't reach the version servers (timed out)." when most or all lookups failed. */
  networkIssue: string | null;
}

/** After this long, the latest-versions spinner says the connection is slow. */
const SLOW_LOOKUP_MS = 5_000;

/** The network line under the table, or null when lookups mostly worked. */
function networkIssueLine(results: readonly ToolScan[]): string | null {
  const problem = networkProblem(getNetwork().report());
  if (!problem) return null;
  const shown = results.some((r) => r.latestStaleCachedAt) ? "Showing installed versions and cached results." : "Showing installed versions only.";
  return `${problem} ${shown}`;
}

/** What a run works against: the real machine, or the --demo fixture. */
interface Runtime {
  tools: readonly ToolDescriptor[];
  /** Folder whose package.json the project-copy check reads (null: no check). */
  cwd: string | null;
  /** Demo only: the project to check instead of reading a folder. */
  projectFixture?: ProjectManifest;
  /** "Dev CLIs hidden · --show-group dev" when a group is left out of this run. */
  hiddenNote?: string | null;
  /** Big banner (default run), compact header line (option paths) or none (piped, CI). */
  header?: HeaderStyle;
  /** Lines shown right under the header (e.g. "Dev CLIs hidden from now on"). */
  headerNotes?: string[];
  host: Host;
  /** Replaced on Rescan. */
  latest: LatestResolver;
  /** A new resolver for Rescan (same cache, fresh lookups). */
  freshLatest: () => LatestResolver;
  /** Whether ccl-caut runs elevated (started at launch, awaited before plans are made). */
  elevated: Promise<boolean>;
  /** Process listing for the pre-flight check (the demo injects a fixture). */
  listProcesses?: () => Promise<ProcessInfo[] | null>;
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
  /** The "next" (beta) dist-tag, looked up only when this copy is itself a prerelease. */
  next(): string | null;
  context: InstallContext | null;
}

/** Cache key of ccl-caut's beta channel (dist-tag "next"). */
const SELF_NEXT_KEY = "ccl-caut:self-next";
const isPrerelease = (version: string) => /^\d+\.\d+\.\d+-/.test(version);

/**
 * Look up ccl-caut's own latest version in the background. It is never awaited,
 * so it adds no time to a run: a cached value shows up under the banner, a fresh
 * one after the table if it arrived by then, otherwise next run (it is cached).
 */
function startSelfCheck(runtime: Runtime): SelfCheck {
  if (runtime.selfFixture) {
    const { latest, context } = runtime.selfFixture;
    return { immediate: latest, settled: () => latest, next: () => null, context };
  }
  if (!selfCheckEnabled(process.env)) return { immediate: null, settled: () => null, next: () => null, context: null };

  const { host } = runtime;
  const entryPath = host.fs.realpath(process.argv[1] ?? "");
  const parent = nodeModulesParent(entryPath, host.platform);
  const insideProject = parent !== null && host.fs.exists(pathFor(host.platform).join(parent, "package.json"));
  const context = detectInstallContext({ entryPath, env: process.env, insideProject, platform: host.platform });
  if (context === "source") return { immediate: null, settled: () => null, next: () => null, context };

  // One dist-tags request answers both channels (fetchJson de-duplicates it).
  let latest: string | null = null;
  let next: string | null = isPrerelease(VERSION) ? runtime.latest.peek(SELF_NEXT_KEY) : null;
  void runtime.latest.getByKey(SELF_KEY, async () => (await fetchDistTags("ccl-caut"))?.latest ?? null, false).then((v) => {
    latest = v;
  });
  if (isPrerelease(VERSION)) {
    void runtime.latest.getByKey(SELF_NEXT_KEY, async () => (await fetchDistTags("ccl-caut"))?.next ?? null, false).then((v) => {
      next = v ?? next;
    });
  }
  return { immediate: runtime.latest.peek(SELF_KEY), settled: () => latest, next: () => next, context };
}

function createRuntime(options: CliOptions): Runtime {
  if (options.demo) return createDemoRuntime();
  return {
    tools: registry,
    cwd: process.cwd(),
    host: getHost(),
    latest: new LatestResolver(VersionCache.load(), options.refresh),
    freshLatest: () => new LatestResolver(VersionCache.load()),
    elevated: detectElevation(),
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

function scanVerdict({ outdated, upToDate, unknown, retired, selfUpdating, stale }: ScanSummary): string {
  // Never "Everything is up-to-date" from an old cache: say where the answer came from.
  const cached = stale > 0 ? pc.gray(` · ${stale} from cached results`) : "";
  const extras = [
    retired > 0 ? `${retired} retired` : "",
    selfUpdating > 0 ? `${selfUpdating} updating itself` : "",
    unknown > 0 ? `${unknown} could not be checked` : "",
  ]
    .filter(Boolean)
    .map((part) => pc.gray(`, ${part}`))
    .join("");
  if (outdated > 0) {
    return pc.yellow(`${plural(outdated, "update")} available`) + pc.dim(`, ${upToDate} up-to-date`) + extras + cached;
  }
  if (extras || cached) return pc.green(`No updates found`) + pc.dim(` (${upToDate} up-to-date`) + extras + pc.dim(")") + cached;
  return pc.green(`Everything is up-to-date (${upToDate})`);
}

function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  return minutes < 1 ? "less than a minute" : `${minutes}m`;
}

/** Plans depend on whether we run elevated (e.g. gcloud under Program Files); record it on the host first. */
async function applyElevation(runtime: Runtime): Promise<void> {
  const elevated = await runtime.elevated.catch(() => false);
  if (getHost().elevated !== elevated) setHost({ ...getHost(), elevated });
}
async function scan(runtime: Runtime): Promise<ScanResult> {
  const { tools, host, latest } = runtime;
  prefetchLatest(tools, latest);
  const detections = await detectAll(tools, host);
  await applyElevation(runtime);
  const results = await resolveLatest(detections, latest, project(runtime));
  latest.cache?.save();
  return { results, detections, networkIssue: networkIssueLine(results) };
}

/** The current folder's package.json for the project-copy check (read-only; a few ms). */
function project(runtime: Runtime): ProjectManifest | null {
  if (runtime.projectFixture) return runtime.projectFixture;
  return runtime.cwd ? findProjectManifest(runtime.cwd, runtime.host) : null;
}

/**
 * Groups this run shows: --only wins for one run, otherwise everything except
 * the groups hidden with --hide-group. The note explains what is left out.
 */
function groupView(options: CliOptions, hidden: readonly ToolGroup[]): { groups: ToolGroup[]; note: string | null } {
  if (options.only) {
    const left = TOOL_GROUPS.filter((g) => g !== options.only);
    return { groups: [options.only], note: `${left.map((g) => GROUP_LABELS[g]).join(", ")} hidden · --only ${options.only}` };
  }
  const groups = TOOL_GROUPS.filter((g) => !hidden.includes(g));
  const off = TOOL_GROUPS.filter((g) => hidden.includes(g));
  return { groups, note: off.length > 0 ? off.map((g) => `${GROUP_LABELS[g]} hidden · --show-group ${g}`).join(" · ") : null };
}

async function runJson(runtime: Runtime, options: CliOptions): Promise<number> {
  const { check } = options;
  const self = startSelfCheck(runtime);
  const { results } = await scan(runtime);
  const summary = summarize(results);
  const { latest } = runtime;
  const report = {
    tool: "ccl-caut",
    version: VERSION,
    self: { version: VERSION, latest: self.settled() ?? self.immediate, next: self.next() },
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    node: process.version,
    // Set when some latest versions came from the disk cache (oldest entry used).
    latestCachedAt: latest.oldestCachedAt === null ? null : new Date(latest.oldestCachedAt).toISOString(),
    // How the latest-version lookups went; problem is set when most or all of them failed.
    network: { ...getNetwork().report(), problem: networkProblem(getNetwork().report()) },
    // Groups hidden with --hide-group (--json still lists every tool, each with its "group").
    hiddenGroups: runtime.selections.hiddenGroups,
    summary,
    tools: results,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const code = check ? checkExitCode(summary) : 0;
  if (options.output) {
    // The file only; the path goes to stderr so stdout stays clean.
    const written = writeOutputFile(options.output, json, options.force, undefined, options.demo);
    if (!written.ok) {
      process.stderr.write(`ccl-caut: ${written.error}\n`);
      return 2;
    }
    process.stderr.write(`${written.path}${written.simulated ? " (demo: nothing was written)" : ""}\n`);
    return code;
  }
  process.stdout.write(json);
  // Scripts, CI and --yes get exactly the JSON; a person at a terminal can copy or save it.
  if (wantsReportPrompt(Boolean(process.stdout.isTTY && process.stdin.isTTY), process.env, options.yes)) {
    await reportPrompt(json, realReportDeps(options.demo));
  }
  return code;
}

/** Banner + two progress phases + table + notes. Shared by --check and the interactive flow. */
/** Shows the newer-ccl-caut notice once per run (see createNoticeSlot); null until a scan starts. */
let selfNotice: { take(): string | null } | null = null;

function takeSelfNotice(): string | null {
  return selfNotice?.take() ?? null;
}

/** After the final summary: the notice, if the lookup only finished during the run. */
function printLateSelfNotice(): void {
  const notice = takeSelfNotice();
  if (notice) console.log(pc.dim(notice));
}

/** Notes for under the header, shown once. */
function printHeaderNotes(runtime: Runtime): void {
  for (const note of runtime.headerNotes?.splice(0) ?? []) process.stdout.write(`${tone.muted(note)}\n`);
}

/** Center the banner only for a person at a terminal: --check, --json and piped output stay left-aligned. */
async function scanWithProgress(runtime: Runtime, center: boolean): Promise<ScanResult> {
  const { tools, host, latest } = runtime;
  const self = startSelfCheck(runtime);
  // Under the banner only what is known right now (cache or demo fixture).
  selfNotice = createNoticeSlot(VERSION, self.context, () => self.settled() ?? self.immediate, () => self.next());
  const bannerNotice = self.immediate ? selfNotice.take() : null;
  printHeader(runtime.header ?? "banner", VERSION, bannerNotice, center);
  printHeaderNotes(runtime);
  intro(pc.inverse(" Scan "));
  prefetchLatest(tools, latest);

  const progress = createProgress();
  progress.start("Scanning for installed CLIs...");
  const detections = await detectAll(tools, host);
  const found = detections.filter((d) => d.instances.length > 0).length;
  const discoverHint = found < detections.length ? " · ccl-caut --discover to see all" : "";
  const hiddenHint = runtime.hiddenNote ? ` · ${runtime.hiddenNote}` : "";
  progress.stop(`Found ${found} of ${detections.length} supported CLIs${discoverHint}${hiddenHint}`);

  progress.start("Checking latest versions...");
  const slow = setTimeout(() => progress.message("Checking latest versions… (slow connection)"), SLOW_LOOKUP_MS);
  await applyElevation(runtime);
  const results = await resolveLatest(detections, latest, project(runtime));
  clearTimeout(slow);
  latest.cache?.save();
  const networkIssue = networkIssueLine(results);
  progress.stop(networkIssue ? "Latest versions could not be checked" : "Latest versions checked");

  console.log(`${pc.gray("│")}\n${renderTable(results, process.stdout.isTTY ? (process.stdout.columns ?? 80) : Number.POSITIVE_INFINITY)}`);
  printNotes(results, getHost().platform);
  const lateNotice = takeSelfNotice();
  if (lateNotice) log.message(pc.dim(lateNotice));
  if (latest.oldestCachedAt !== null) {
    const age = formatAge(Date.now() - latest.oldestCachedAt);
    log.message(pc.dim(`Latest versions cached ${age} ago · --refresh to recheck`));
  }
  const rateNotice = githubRateLimitNotice();
  if (rateNotice) log.message(tone.muted(rateNotice), { symbol: INFO_SYMBOL });
  if (networkIssue) {
    const offerRetry = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    log.warn(`${tone.action(networkIssue)}\n${tone.muted(offerRetry ? "Press r to retry, or run ccl-caut --doctor to see what's wrong." : "Run ccl-caut --doctor to see what's wrong.")}`);
  }
  return { results, detections, networkIssue };
}

/** --discover: every supported tool, installed or not, with its official install docs. */
async function runDiscover(runtime: Runtime): Promise<number> {
  printHeader(runtime.header ?? "line", VERSION);
  printHeaderNotes(runtime);
  intro(pc.inverse(" Discover "));
  const progress = createProgress();
  progress.start("Scanning for installed CLIs...");
  const detections = await detectAll(runtime.tools, runtime.host);
  const found = detections.filter((d) => d.instances.length > 0).length;
  progress.stop(`${found} of ${detections.length} supported CLIs installed`);
  console.log(`${pc.gray("│")}\n${renderDiscovery(detections, runtime.selections.hiddenGroups)}`);
  outro(pc.dim("ccl-caut never installs tools. To add one, follow its official install docs above."));
  return 0;
}

async function runCheck(runtime: Runtime): Promise<number> {
  const { results } = await scanWithProgress(runtime, false);
  const summary = summarize(results);
  outro(scanVerdict(summary));
  return checkExitCode(summary);
}

function optionHint(r: ToolScan): string {
  const parts: string[] = [];
  if (r.state === "self-updating") parts.push("updates itself: runs its own updater");
  else {
    if (r.state === "retired") parts.push("retired, opt-in");
    parts.push(r.plan?.kind === "auto" ? "runs automatically" : "manual: command will be shown");
  }
  const hint = parts.join(" · ");
  return r.needsAdmin ? `${hint} · ${tone.action("needs admin")}` : hint;
}

function optionLabel(r: ToolScan): string {
  const latest = r.state === "self-updating" ? tone.muted("latest") : tone.action(r.latestVersion ? displayVersion(r.latestVersion) : "?");
  return `${r.name}  ${tone.muted(r.installedVersion ? displayVersion(r.installedVersion) : "?")} ${icons.arrow} ${latest}`;
}

const CLAUDE_RISK = "the running session locks its files, or the session may keep using the old version";
const insideClaudeCode = () => Boolean(process.env.CLAUDECODE);
const isClaudeAuto = (t: UpdateTarget) => t.scan.id === "claude" && t.scan.plan?.kind === "auto";

function adminExplanation(platform: NodeJS.Platform): string {
  return platform === "win32" ? "run ccl-caut from a terminal opened with Run as administrator" : "the command needs sudo";
}

async function findRunning(runtime: Runtime, targets: readonly UpdateTarget[]): Promise<Map<string, number> | null> {
  const processes = await (runtime.listProcesses ?? listProcesses)();
  if (!processes) return null;
  const host = getHost();
  const tools = targets.map((t) => ({ id: t.scan.id, signatures: processSignatures(t.instance, t.tool.npmPackage, host) }));
  return countRunning(processes, tools, host.platform);
}

const plural2 = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "es"}`;

type PreflightAction = "update" | "update-skip-claude" | "update-all" | "recheck" | "back" | "quit";

/**
 * "Ready to update?": which selected tools are running, which need admin, and
 * the Claude Code guard, then Update now / Re-check / Back to selection / Quit.
 * Read-only: nothing is ever stopped or killed.
 */
async function preflight(runtime: Runtime, targets: UpdateTarget[]): Promise<{ action: "update" | "back" | "quit"; targets: UpdateTarget[] }> {
  for (;;) {
    const running = await findRunning(runtime, targets);
    log.step(tone.focus("Pre-flight check"));
    if (running === null) log.message(tone.muted("Couldn't check which tools are running."));
    for (const t of targets) {
      const n = running?.get(t.scan.id);
      if (n) log.warn(tone.action(`${t.scan.name} is running (${plural2(n, "process")})`));
    }
    log.message(tone.muted("Close agent sessions and IDEs or terminals using these tools (VS Code, etc.) first."));
    const admin = targets.filter((t) => t.scan.needsAdmin);
    if (admin.length > 0) {
      log.warn(tone.action(`Needs admin: ${admin.map((t) => t.scan.shortName).join(", ")} (${adminExplanation(getHost().platform)})`));
    }
    const claudeGuard = insideClaudeCode() && targets.some(isClaudeAuto);
    if (claudeGuard) {
      log.warn(tone.action(`ccl-caut is running inside a Claude Code session. Updating Claude Code now may fail because ${CLAUDE_RISK}.`));
    }

    const options: { value: PreflightAction; label: string }[] = claudeGuard
      ? [
          { value: "update-skip-claude", label: "Update now, skip Claude Code" },
          { value: "update-all", label: "Update now, including Claude Code" },
        ]
      : [{ value: "update", label: "Update now" }];
    options.push({ value: "recheck", label: "Re-check" }, { value: "back", label: "Back to selection" }, { value: "quit", label: "Quit" });
    const initialValue: PreflightAction = claudeGuard ? "update-skip-claude" : running && running.size > 0 ? "recheck" : "update";

    const choice = await choose({ message: "Ready to update?", options, initialValue });
    if (choice === CANCELLED) exitCancelled();
    if (choice === QUIT || choice === "quit") return { action: "quit", targets };
    if (choice === "back") return { action: "back", targets };
    if (choice === "recheck") continue;
    return { action: "update", targets: choice === "update-skip-claude" ? targets.filter((t) => !isClaudeAuto(t)) : targets };
  }
}

/** --yes: no prompt. Running tools are skipped (and Claude Code inside a Claude Code session). */
async function preflightUnattended(runtime: Runtime, targets: UpdateTarget[]): Promise<{ targets: UpdateTarget[]; skipped: number }> {
  const running = await findRunning(runtime, targets);
  const tagged = targets.map((t) => ({ id: t.scan.id, claudeAuto: isClaudeAuto(t), t }));
  const { keep, skipped } = splitUnattended(tagged, running, insideClaudeCode());
  for (const skip of skipped) {
    const name = skip.target.t.scan.name;
    log.warn(
      tone.action(
        skip.reason === "running"
          ? `Skipping ${name}: it is running (${plural2(skip.processes, "process")}). Close it and run ccl-caut again.`
          : `Skipping Claude Code: ccl-caut is running inside a Claude Code session (${CLAUDE_RISK}). Run it from another terminal.`,
      ),
    );
  }
  return { targets: keep.map((k) => k.t), skipped: skipped.length };
}

function quitNothingChanged(): RoundResult {
  outro(tone.muted("Nothing was changed."));
  return { code: 0, next: "done" };
}

interface RoundResult {
  code: number;
  next: "done" | "rescan" | "retry";
}

function summaryLine(outcome: UpdateOutcome, upToDate: number, skipped: number): string {
  const parts = [tone.done(`${outcome.updated} updated`), tone.action(`${outcome.manual} manual`), tone.done(`${upToDate} up-to-date`)];
  if (outcome.current > 0) parts.push(tone.done(`${outcome.current} already current`));
  if (skipped > 0) parts.push(tone.action(`${skipped} skipped (running)`));
  if (outcome.held > 0) parts.push(tone.action(`${outcome.held} held`));
  if (outcome.unchanged > 0) parts.push(tone.action(`${outcome.unchanged} unchanged`));
  if (outcome.failed > 0) parts.push(tone.bad(`${outcome.failed} failed`));
  return parts.join(tone.muted(", "));
}

/** One pass: scan, checklist, pre-flight, updates, summary, then Rescan / Quit. */
async function interactiveRound(runtime: Runtime, options: CliOptions): Promise<RoundResult> {
  const { results, detections, networkIssue } = await scanWithProgress(runtime, Boolean(process.stdout.isTTY));
  const summary = summarize(results);
  const offered = results.filter(isOffered);
  // Retry is offered (r key) when the lookups failed and someone is there to press it.
  const retry = Boolean(networkIssue) && !options.yes && Boolean(process.stdin.isTTY && process.stdout.isTTY);

  if (offered.length === 0) {
    if (retry) {
      const next = await choose({
        message: "Latest versions could not be checked",
        options: [
          { value: "retry", label: "Retry" },
          { value: "quit", label: "Quit" },
        ],
        initialValue: "retry",
        retry: true,
      });
      if (next === CANCELLED) exitCancelled();
      if (next === "retry" || next === RETRY) return { code: 0, next: "retry" };
      outro(tone.muted("Nothing was changed."));
      return { code: 0, next: "done" };
    }
    outro(scanVerdict(summary));
    return { code: 0, next: "done" };
  }
  const targetsFor = (picked: readonly string[]): UpdateTarget[] => {
    const targets: UpdateTarget[] = [];
    for (const scan of offered) {
      const detection = detections.find((d) => d.tool.id === scan.id);
      const instance = detection?.instances[0];
      if (picked.includes(scan.id) && detection && instance) targets.push({ scan, tool: detection.tool, instance });
    }
    return targets;
  };

  const initial = initialSelection(offered, runtime.selections.toolChoices);
  let targets: UpdateTarget[];
  let skipped = 0;
  const interactive = !options.yes;
  if (!interactive) {
    const names = offered.filter((r) => initial.ids.includes(r.id)).map((r) => r.shortName);
    log.info(names.length > 0 ? `--yes: updating ${names.join(", ")}` : "--yes: nothing is selected by default");
    const unattended = await preflightUnattended(runtime, targetsFor(initial.ids));
    targets = unattended.targets;
    skipped = unattended.skipped;
  } else {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      outro(`${scanVerdict(summary)}${tone.muted(". Run in an interactive terminal (or with --yes) to apply updates.")}`);
      return { code: 0, next: "done" };
    }
    let picked = initial.ids;
    for (;;) {
      const answer = await checklist({
        message: "Select the CLIs to update",
        ...(initial.remembered && { hint: "Selection remembered from your last run · --reset-selection to clear" }),
        options: offered.map((r) => ({ value: r.id, label: optionLabel(r), hint: optionHint(r), group: GROUP_LABELS[r.group] })),
        initialValues: picked,
        retry,
      });
      if (answer === QUIT) return quitNothingChanged();
      if (answer === RETRY) return { code: 0, next: "retry" };
      if (answer === CANCELLED) exitCancelled();
      picked = answer;
      runtime.selections.saveChoices(recordSelection(runtime.selections.toolChoices, offered, picked));
      targets = targetsFor(picked);
      if (targets.length === 0) {
        outro(tone.muted("Nothing selected: nothing was changed."));
        return { code: 0, next: "done" };
      }
      const ready = await preflight(runtime, targets);
      if (ready.action === "back") continue;
      if (ready.action === "quit") return quitNothingChanged();
      targets = ready.targets;
      break;
    }
  }
  if (targets.length === 0) {
    outro(tone.muted(`Nothing to update: nothing was changed.${skipped > 0 ? ` ${skipped} skipped (running).` : ""}`));
    return { code: 0, next: "done" };
  }

  process.off("SIGINT", exitCancelled); // applyUpdates handles Ctrl+C from here on
  const outcome = await applyUpdates(targets, runtime.latest.cache, runtime.executor);
  process.once("SIGINT", exitCancelled);

  const code = outcome.interrupted ? CANCEL_EXIT_CODE : outcome.failed > 0 || outcome.unchanged > 0 ? 1 : 0;
  const line = summaryLine(outcome, summary.upToDate, skipped);
  if (!interactive || outcome.interrupted) {
    outro(line);
    return { code, next: "done" };
  }
  log.success(line);
  const next = await choose({
    message: "What next?",
    options: [
      { value: "rescan", label: "Rescan" },
      { value: "quit", label: "Quit" },
    ],
    initialValue: "quit",
  });
  if (next === CANCELLED) exitCancelled();
  if (next === "rescan") return { code, next: "rescan" };
  outro(tone.muted("Done."));
  return { code, next: "done" };
}

async function runInteractive(runtime: Runtime, options: CliOptions): Promise<number> {
  for (;;) {
    const round = await interactiveRound(runtime, options);
    if (round.next !== "rescan" && round.next !== "retry") return round.code;
    // Retry: forget this run's failed lookups so they go to the network again.
    if (round.next === "retry") getNetwork().reset();
    // Fresh lookups for everything (the tools just updated were dropped from the cache).
    runtime.latest = runtime.freshLatest();
    if (shouldClearScreen({ interactive: true, isTTY: Boolean(process.stdout.isTTY), env: process.env, noClear: options.noClear, demo: options.demo })) {
      clearScreenKeepScrollback();
    }
  }
}
/** End of a scan run: the late update notice (if any), then the exit code. */
function finish(code: number): number {
  printLateSelfNotice();
  return code;
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n\n${helpText(VERSION)}`);
    return 2;
  }
  const { options } = parsed;
  const header = headerStyle(options, Boolean(process.stdout.isTTY), process.env);

  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (options.help) {
    // In a terminal the shared header replaces the help's own title line.
    printHeader(header, VERSION);
    process.stdout.write(helpText(VERSION, header === "none"));
    return 0;
  }

  if (options.doctor) {
    printHeader(header, VERSION);
    const { lines, code } = await doctorReport(VERSION);
    process.stdout.write(`${lines.join("\n")}\n`);
    return code;
  }

  const runtime = createRuntime(options);
  runtime.header = header;
  runtime.headerNotes = [];
  if (options.resetSelection) runtime.selections.reset();
  for (const [group, hide] of [
    [options.hideGroup, true],
    [options.showGroup, false],
  ] as const) {
    if (!group) continue;
    runtime.selections.setGroupHidden(group, hide);
    runtime.headerNotes.push(hide ? `${GROUP_LABELS[group]} hidden from now on · --show-group ${group} to show them again` : `${GROUP_LABELS[group]} shown again`);
  }
  // --json and --discover always cover every group.
  if (options.json) return runJson(runtime, options);
  if (options.discover) return runDiscover(runtime);
  const view = groupView(options, runtime.selections.hiddenGroups);
  runtime.tools = runtime.tools.filter((tool) => view.groups.includes(tool.group));
  runtime.hiddenNote = view.note;
  if (options.check) return finish(await runCheck(runtime));

  const interactive = !options.yes;
  const clear = { interactive, isTTY: Boolean(process.stdout.isTTY), env: process.env, noClear: options.noClear, demo: options.demo };
  if (shouldClearScreen(clear)) clearScreenKeepScrollback();

  // Ctrl+C outside a prompt (e.g. during a scan) exits cleanly too.
  process.once("SIGINT", exitCancelled);
  return finish(await runInteractive(runtime, options));
}

/**
 * Exit only after stdout and stderr are flushed. Pipes are asynchronous on
 * macOS, and process.exit() right after a large write (--json | jq) would cut
 * the output off at 8 KB. An empty write's callback runs once everything
 * written before it has been flushed.
 */
function exitWhenFlushed(code: number): void {
  let pending = 2;
  const done = () => {
    if (--pending === 0) process.exit(code);
  };
  process.stdout.write("", done);
  process.stderr.write("", done);
}

main().then(
  (code) => exitWhenFlushed(code),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${pc.red(`ccl-caut: ${message}`)}\n`);
    if (process.env.CCL_CAUT_DEBUG && error instanceof Error) process.stderr.write(`${error.stack ?? ""}\n`);
    exitWhenFlushed(1);
  },
);