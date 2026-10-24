import { cancel, intro, log, outro } from "@clack/prompts";
import pc from "./ui/colors";
import pkg from "../package.json" with { type: "json" };
import { createDemoRuntime } from "./demo/runtime";
import { countRunning, listProcesses, processSignatures, splitUnattended, type ProcessInfo } from "./processes";
import { registry } from "./registry";
import {
  detectAll,
  LatestResolver,
  pendingScan,
  prefetchLatest,
  resolveLatest,
  summarize,
  type Detection,
  type ScanSummary,
} from "./scan";
import { createNoticeSlot, detectInstallContext, nodeModulesParent, selfCheckEnabled, selfUpdateTarget, type InstallContext } from "./self";
import { SELF_ID, SELF_NAME, selfLast, selfTool, selfUpdateRow } from "./selfupdate";
import { initialSelection, isOffered, recordSelection, type SelectionStore } from "./selection";
import type { ToolDescriptor, ToolScan } from "./types";
import { headerStyle, printHeader, type HeaderStyle } from "./ui/banner";
import { CANCEL_EXIT_CODE, CANCEL_MESSAGE, createProgress } from "./ui/progress";
import { displayVersion } from "./ui/format";
import { icons, isUnicodeSupported } from "./ui/symbols";
import { fitsPopup, inlineNotes, openUrl, showNotes, type PopupContent, type ShowResult } from "./whatsnew/popup";
import { demoNotes } from "./demo/notes";
import { NotesCache } from "./whatsnew/cache";
import { rowsForWhatsNew } from "./whatsnew/flow";
import { loadNotes, type NotesResult, type NotesTarget } from "./whatsnew/notes";
import { notesLink, resolveSource, SELF_NOTES, type ReleaseNotesSource } from "./whatsnew/sources";
import { clearScreenKeepScrollback, shouldClearScreen } from "./ui/screen";
import { discoverHint, renderDiscovery } from "./ui/discover";
import { latestVersionsProgress, liveTableAllowed } from "./ui/livetable";
import { preflightQuestion } from "./ui/preflight";
import { INFO_SYMBOL, printNotes, renderTable } from "./ui/table";
import { CANCELLED, checklist, choose, NOTES, QUIT, RESCAN, RETRY } from "./ui/prompts";
import { demoBlock, demoMode, setDemoMode, simulated } from "./ui/demo-notice";
import { collectPending, leftOverPending, pendingForResults, pendingForSelection, renderPending, type PendingItem } from "./pending";
import { getNetwork, networkProblem } from "./utils/http";
import { doctorReport } from "./doctor";
import { reportBugLine, shouldShowStar, starLine, supportsHyperlinks } from "./ui/links";
import { realReportDeps, reportPrompt, wantsReportPrompt, writeOutputFile } from "./report";
import { githubRateLimitNotice } from "./utils/github";
import { findProjectManifest, type ProjectManifest } from "./project";
import { GROUP_LABELS, TOOL_GROUPS, type ToolGroup } from "./types";
import { tone } from "./ui/theme";
import { applyUpdates, updateExitCode, type UpdateExecutor, type UpdateOutcome, type UpdateTarget } from "./ui/update";
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
  /** ccl-caut's own latest version lookup (for the checklist row). */
  self: SelfCheck;
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
  selfFixture?: { latest: string; context: InstallContext; entryPath?: string };
  /** CCL CAUT's own update re-check (the demo replaces it; default: `ccl-caut --version`). */
  selfTool?: ToolDescriptor;
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
  /** Settles when the lookups are done (awaited only for the checklist row, with a cap). */
  ready: Promise<unknown>;
  /** Real path of the running entry script. */
  entryPath: string;
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
    const { latest, context, entryPath = "" } = runtime.selfFixture;
    return { immediate: latest, settled: () => latest, next: () => null, context, ready: Promise.resolve(), entryPath };
  }
  const off = { immediate: null, settled: () => null, next: () => null, ready: Promise.resolve(), entryPath: "" };
  if (!selfCheckEnabled(process.env)) return { ...off, context: null };

  const { host } = runtime;
  const entryPath = host.fs.realpath(process.argv[1] ?? "");
  const parent = nodeModulesParent(entryPath, host.platform);
  const insideProject = parent !== null && host.fs.exists(pathFor(host.platform).join(parent, "package.json"));
  const context = detectInstallContext({ entryPath, env: process.env, insideProject, platform: host.platform });
  if (context === "source") return { ...off, context };

  // One dist-tags request answers both channels (fetchJson de-duplicates it).
  let latest: string | null = null;
  let next: string | null = isPrerelease(VERSION) ? runtime.latest.peek(SELF_NEXT_KEY) : null;
  const lookups = [
    runtime.latest.getByKey(SELF_KEY, async () => (await fetchDistTags("ccl-caut"))?.latest ?? null, false).then((v) => {
      latest = v;
    }),
  ];
  if (isPrerelease(VERSION)) {
    lookups.push(
      runtime.latest.getByKey(SELF_NEXT_KEY, async () => (await fetchDistTags("ccl-caut"))?.next ?? null, false).then((v) => {
        next = v ?? next;
      }),
    );
  }
  return { immediate: runtime.latest.peek(SELF_KEY), settled: () => latest, next: () => next, context, ready: Promise.all(lookups), entryPath };
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

/** q during the check: like q on a prompt. */
function quitDuringScan(): never {
  outro(tone.muted("Nothing was changed."));
  process.exit(0);
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
async function scan(runtime: Runtime): Promise<Omit<ScanResult, "self">> {
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
    ...(options.demo && { demo: true }),
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
    // Commands the user would still have to run, for the tools that would be selected.
    pending: pendingOfSelection(results, runtime, options),
    summary,
    // whatsNewUrl: the official release notes of each tool's latest version (never fetched here).
    tools: results.map((r) => ({ ...r, whatsNewUrl: whatsNewUrl(runtime, r) })),
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

/** Notes for under the header, shown once (the demo notice first). */
function printHeaderNotes(runtime: Runtime): void {
  printDemoNotice();
  for (const note of runtime.headerNotes?.splice(0) ?? []) process.stdout.write(`${tone.muted(note)}\n`);
}

/** The demo notice block (demo runs only): under the header and at the very end. */
function printDemoNotice(): void {
  if (demoMode()) process.stdout.write(`${demoBlock().join("\n")}\n`);
}

/** A demo run ends with the notice too. */
function withDemoFooter(code: number): number {
  printDemoNotice();
  return code;
}

/**
 * Center the banner only for a person at a terminal: --check, --json and piped
 * output stay left-aligned. With `selfRow`, a global install gets the newer
 * ccl-caut as a checklist row instead of the notice.
 */
async function scanWithProgress(runtime: Runtime, center: boolean, selfRow = false): Promise<ScanResult> {
  const { tools, host, latest } = runtime;
  const self = startSelfCheck(runtime);
  // Under the banner only what is known right now (cache or demo fixture).
  selfNotice = selfRow && self.context === "global" ? null : createNoticeSlot(VERSION, self.context, () => self.settled() ?? self.immediate, () => self.next());
  const bannerNotice = self.immediate ? (selfNotice?.take() ?? null) : null;
  printHeader(runtime.header ?? "banner", VERSION, bannerNotice, center);
  printHeaderNotes(runtime);
  intro(pc.inverse(" Scan "));
  prefetchLatest(tools, latest);

  const progress = createProgress();
  progress.start("Scanning for installed CLIs...");
  const detections = await detectAll(tools, host);
  const found = detections.filter((d) => d.instances.length > 0).length;
  const hiddenHint = runtime.hiddenNote ? ` · ${runtime.hiddenNote}` : "";
  progress.stop(`Found ${found} of ${detections.length} supported CLIs${discoverHint(found, detections.length, runtime.selections.discoverUsed)}${hiddenHint}`);

  await applyElevation(runtime);
  // In a terminal: the live table (rows fill in as lookups finish); else the spinner.
  const check = latestVersionsProgress({
    live: liveTableAllowed(Boolean(process.stdout.isTTY), process.env),
    placeholders: detections.map(pendingScan).filter((r) => r.installed),
    message: "Checking latest versions...",
    keys: { quit: quitDuringScan, cancel: exitCancelled },
  });
  const slow = setTimeout(() => check.message("Checking latest versions… (slow connection)"), SLOW_LOOKUP_MS);
  const results = await resolveLatest(detections, latest, project(runtime), (scan) => check.update(scan));
  clearTimeout(slow);
  latest.cache?.save();
  const networkIssue = networkIssueLine(results);
  check.stop(networkIssue ? "Latest versions could not be checked" : "Latest versions checked");

  console.log(`${pc.gray(icons.bar)}\n${renderTable(results, process.stdout.isTTY ? (process.stdout.columns ?? 80) : Number.POSITIVE_INFINITY)}`);
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
  return { results, detections, networkIssue, self };
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
  console.log(`${pc.gray(icons.bar)}\n${renderDiscovery(detections, runtime.selections.hiddenGroups)}`);
  outro(pc.dim("ccl-caut never installs tools. To add one, follow its official install docs above."));
  // From now on the scan line no longer suggests --discover.
  if (!runtime.selections.discoverUsed) runtime.selections.markDiscoverUsed();
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
  // ccl-caut itself is running, by definition: its own update is never held back for that.
  const tools = targets.filter((t) => t.scan.id !== SELF_ID).map((t) => ({ id: t.scan.id, signatures: processSignatures(t.instance, t.tool.npmPackage, host) }));
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
  for (let check = 0; ; check++) {
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

    const stillRunning = targets.filter((t) => running?.get(t.scan.id)).map((t) => t.scan.name);
    const choice = await choose({ message: preflightQuestion(check, stillRunning), options, initialValue });
    if (choice === CANCELLED) exitCancelled();
    if (choice === QUIT || choice === "quit") return { action: "quit", targets };
    if (choice === "back") return { action: "back", targets };
    if (choice === "recheck") continue;
    return { action: "update", targets: choice === "update-skip-claude" ? targets.filter((t) => !isClaudeAuto(t)) : targets };
  }
}

/**
 * Pending commands without a run (--json, --pending): the tools that would be
 * selected (remembered ticks, else the defaults) in the groups this run shows.
 */
function pendingOfSelection(results: readonly ToolScan[], runtime: Runtime, options: CliOptions): PendingItem[] {
  return pendingForResults(results, runtime.selections.toolChoices, groupView(options, runtime.selections.hiddenGroups).groups);
}

/** --pending: rescan quietly, print only the commands still to run. Exit 1 when there are any. */
async function runPending(runtime: Runtime, options: CliOptions): Promise<number> {
  const { results } = await scan(runtime);
  const pending = pendingOfSelection(results, runtime, options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(pending, null, 2)}\n`);
    return pending.length > 0 ? 1 : 0;
  }
  printHeader(runtime.header ?? "line", VERSION);
  printHeaderNotes(runtime);
  if (pending.length > 0) process.stdout.write(renderPending(pending));
  else if (process.stdout.isTTY) process.stdout.write(`${tone.muted("Nothing to run yourself.")}\n`);
  return pending.length > 0 ? 1 : 0;
}

/**
 * --yes: no prompt. Skipped with a reason: running tools, Claude Code inside a
 * Claude Code session, and automatic updates that need admin rights (they would
 * fail; ccl-caut never elevates itself).
 */
async function preflightUnattended(runtime: Runtime, targets: UpdateTarget[]): Promise<{ targets: UpdateTarget[]; skipped: number; skippedWhy: Map<string, string> }> {
  const running = await findRunning(runtime, targets);
  const tagged = targets.map((t) => ({ id: t.scan.id, claudeAuto: isClaudeAuto(t), needsAdmin: t.scan.needsAdmin && t.scan.plan?.kind !== "manual", t }));
  const { keep, skipped } = splitUnattended(tagged, running, insideClaudeCode());
  for (const skip of skipped) {
    const name = skip.target.t.scan.name;
    log.warn(
      tone.action(
        skip.reason === "running"
          ? `Skipping ${name}: it is running (${plural2(skip.processes, "process")}). Close it and run ccl-caut again.`
          : skip.reason === "needs-admin"
            ? `Skipping ${name}: needs admin rights (${adminExplanation(getHost().platform)}). --yes never elevates; update it by hand.`
            : `Skipping Claude Code: ccl-caut is running inside a Claude Code session (${CLAUDE_RISK}). Run it from another terminal.`,
      ),
    );
  }
  const why = { running: "was running", "needs-admin": "needs admin rights", "claude-session": "skipped inside Claude Code" } as const;
  return { targets: keep.map((k) => k.t), skipped: skipped.length, skippedWhy: new Map(skipped.map((s) => [s.target.id, why[s.reason]])) };
}

/** Wait for ccl-caut's own lookup (it ran during the scan) at most this long. */
const SELF_ROW_WAIT_MS = 3_000;

/** The "CCL CAUT" row when a newer ccl-caut can be installed over this global copy. */
async function selfUpdateRowFor(self: SelfCheck): Promise<Awaited<ReturnType<typeof selfUpdateRow>>> {
  if (self.context !== "global") return null;
  await Promise.race([self.ready, new Promise((resolve) => setTimeout(resolve, SELF_ROW_WAIT_MS).unref())]);
  const target = selfUpdateTarget(VERSION, self.settled() ?? self.immediate, self.next());
  return target ? selfUpdateRow({ current: VERSION, target: target.version, context: self.context, entryPath: self.entryPath }) : null;
}

function quitNothingChanged(pending: PendingItem[] = []): RoundResult {
  outro(tone.muted("Nothing was changed."));
  return { code: 0, next: "done", pending };
}

interface RoundResult {
  code: number;
  next: "done" | "rescan" | "retry";
  /** Commands the user still has to run themselves (printed last, at exit). */
  pending?: PendingItem[];
}

function summaryLine(outcome: UpdateOutcome, upToDate: number, skipped: number): string {
  const parts = [tone.done(`${outcome.updated} updated`), tone.action(`${outcome.manual} manual`), tone.done(`${upToDate} up-to-date`)];
  if (outcome.current > 0) parts.push(tone.done(`${outcome.current} already current`));
  if (skipped > 0) parts.push(tone.action(`${skipped} skipped`));
  if (outcome.held > 0) parts.push(tone.action(`${outcome.held} held`));
  if (outcome.unchanged > 0) parts.push(tone.action(`${outcome.unchanged} unchanged`));
  if (outcome.failed > 0) parts.push(tone.bad(`${outcome.failed} failed`));
  return parts.join(tone.muted(", "));
}

/** Where a row's notes are: its registry source for the copy that runs (CCL CAUT's own row: its releases). */
function notesSourceFor(runtime: Runtime, row: Pick<ToolScan, "id" | "installMethod" | "installedVersion">): ReleaseNotesSource | null {
  if (row.id === SELF_ID) return SELF_NOTES;
  const tool = runtime.tools.find((t) => t.id === row.id) ?? registry.find((t) => t.id === row.id);
  return tool ? resolveSource(tool.releaseNotes, row.installMethod, row.installedVersion) : null;
}

/** The notes to fetch for a row: the version CCL CAUT shows as Latest. */
function notesTargetFor(runtime: Runtime, row: ToolScan): NotesTarget & { link: string } {
  const source = notesSourceFor(runtime, row) ?? { kind: "link-only", url: row.docsUrl };
  return { id: row.id, name: row.name, version: row.latestVersion, installed: row.installedVersion, source, link: notesLink(source, row.latestVersion) };
}

/** The row's notes (the demo: fixture notes, no network). Never rejects. */
function notesFor(runtime: Runtime, options: CliOptions, row: ToolScan, signal?: AbortSignal): Promise<NotesResult> {
  if (options.demo) return Promise.resolve(demoNotes(row));
  return loadNotes(notesTargetFor(runtime, row), { cache: NotesCache.open() }, signal);
}

/** The popup for one row: "Fetching notes…" first, q cancels the fetch. */
function showRowNotes(runtime: Runtime, options: CliOptions, row: ToolScan, tooSmall: "inline" | "report" = "inline"): Promise<ShowResult> {
  const abort = new AbortController();
  const target = notesTargetFor(runtime, row);
  const loading: Omit<PopupContent, "state"> = { tool: row.name, version: row.latestVersion ?? "", link: target.link };
  return showNotes(notesFor(runtime, options, row, abort.signal), {
    input: process.stdin,
    output: process.stdout,
    ascii: !isUnicodeSupported(),
    cursorHiddenAfter: true,
    loading,
    cancel: () => abort.abort(),
    tooSmall,
  });
}

/** n on "What next?": one updated tool opens directly; several get a small picker first. */
async function notesAfterUpdate(runtime: Runtime, options: CliOptions, rows: readonly ToolScan[]): Promise<void> {
  let row: ToolScan | undefined = rows[0];
  if (rows.length > 1) {
    const back = "__back";
    const pick = await choose({
      message: "What's new in",
      options: [...rows.map((r) => ({ value: r.id, label: `${r.name} ${r.latestVersion ? displayVersion(r.latestVersion) : ""}`.trim() })), { value: back, label: "Back" }],
      initialValue: rows[0]!.id,
    });
    row = rows.find((r) => r.id === pick);
  }
  if (!row) return;
  const shown = await showRowNotes(runtime, options, row, "report");
  if (shown === "too-small") log.message(tone.muted(`Window too small for notes. Official notes: ${notesTargetFor(runtime, row).link}`));
}

/** --json: the official notes link for each tool's latest version (nothing is fetched). */
function whatsNewUrl(runtime: Runtime, row: ToolScan): string | null {
  const source = notesSourceFor(runtime, row);
  return source ? notesLink(source, row.latestVersion) : null;
}

/** For the canary: how the notes were looked for, with the version as "<version>" (a format, not a value). */
function sourceFormat(source: ReleaseNotesSource): Record<string, string> {
  const v = "<version>";
  if (source.kind === "github-release") return { kind: source.kind, repo: source.repo, tagFormat: source.tag(v) };
  if (source.kind === "changelog-file") return { kind: source.kind, url: source.url, headingFormat: source.heading(v).source };
  return { kind: source.kind, url: source.url };
}

/**
 * --whats-new <tool>: the notes for that tool's Latest, plain, then the link.
 * 0 = notes shown, 1 = no notes (or a web page only) or the fetch failed, 2 = unknown id.
 */
async function runWhatsNew(runtime: Runtime, options: CliOptions, id: string): Promise<number> {
  let row: ToolScan | null = null;
  if (id === SELF_ID) {
    // Asked for by name: look it up even where the background self-check is off (a source checkout).
    const tags = runtime.selfFixture ? { latest: runtime.selfFixture.latest, next: null } : await fetchDistTags("ccl-caut");
    const latest = tags?.latest ?? null;
    const next = tags?.next ?? null;
    const version = selfUpdateTarget(VERSION, latest, next)?.version ?? (isPrerelease(VERSION) ? (next ?? latest) : latest);
    row = { ...pendingScan({ tool: selfTool, instances: [] }), installed: true, installedVersion: VERSION, latestVersion: version };
  } else {
    const tool = runtime.tools.find((t) => t.id === id);
    if (!tool) {
      const ids = [...runtime.tools.map((t) => t.id), SELF_ID].sort();
      process.stderr.write(`ccl-caut: unknown tool "${id}". Valid ids: ${ids.join(", ")}\n`);
      return 2;
    }
    const detections = await detectAll([tool], runtime.host);
    await applyElevation(runtime);
    [row = null] = await resolveLatest(detections, runtime.latest, null);
    runtime.latest.cache?.save();
  }
  if (!row) return 1;
  const content = await notesFor(runtime, options, row);
  if (options.json) {
    const source = notesSourceFor(runtime, row);
    const { tool, version, state, link, notes, truncated, error, from } = content;
    process.stdout.write(`${JSON.stringify({ id, tool, version, state, link, ...(notes !== undefined && { notes }), ...(truncated && { truncated }), ...(error && { error }), ...(from && { from }), ...(source && { source: sourceFormat(source) }) }, null, 2)}\n`);
  } else {
    process.stdout.write(inlineNotes(content, process.stdout.isTTY ? (process.stdout.columns ?? 80) : 80));
  }
  return content.state === "ready" ? 0 : 1;
}

/** One pass: scan, checklist, pre-flight, updates, summary, then Rescan / Quit. */
async function interactiveRound(runtime: Runtime, options: CliOptions): Promise<RoundResult> {
  const { results, detections, networkIssue, self } = await scanWithProgress(runtime, Boolean(process.stdout.isTTY), true);
  const summary = summarize(results);
  const selfRow = await selfUpdateRowFor(self);
  const offered = [...(selfRow ? [selfRow.scan] : []), ...results.filter(isOffered)];
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
      if (selfRow && scan.id === SELF_ID && picked.includes(SELF_ID)) {
        targets.push({ scan, tool: runtime.selfTool ?? selfTool, instance: selfRow.instance });
        continue;
      }
      const detection = detections.find((d) => d.tool.id === scan.id);
      const instance = detection?.instances[0];
      if (picked.includes(scan.id) && detection && instance) targets.push({ scan, tool: detection.tool, instance });
    }
    return targets;
  };

  const initial = initialSelection(offered, runtime.selections.toolChoices);
  let targets: UpdateTarget[];
  let skipped = 0;
  // --yes: tools left out by the pre-flight check (still to do, with the reason).
  let skippedWhy = new Map<string, string>();
  let selectedScans: ToolScan[] = [];
  const interactive = !options.yes;
  if (!interactive) {
    const names = offered.filter((r) => initial.ids.includes(r.id)).map((r) => r.shortName);
    log.info(names.length > 0 ? `--yes: updating ${names.join(", ")}` : "--yes: nothing is selected by default");
    const chosen = targetsFor(initial.ids);
    selectedScans = chosen.map((t) => t.scan);
    const unattended = await preflightUnattended(runtime, chosen);
    targets = unattended.targets;
    skipped = unattended.skipped;
    skippedWhy = unattended.skippedWhy;
  } else {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      outro(`${scanVerdict(summary)}${tone.muted(". Run in an interactive terminal (or with --yes) to apply updates.")}`);
      return { code: 0, next: "done", pending: pendingForSelection(offered.filter((r) => initial.ids.includes(r.id))) };
    }
    let picked = initial.ids;
    for (;;) {
      const answer = await checklist({
        message: "Select the CLIs to update",
        ...(initial.remembered && { hint: "Selection remembered from your last run · --reset-selection to clear" }),
        options: offered.map((r) => ({ value: r.id, label: optionLabel(r), hint: optionHint(r), group: GROUP_LABELS[r.group] })),
        initialValues: picked,
        retry,
        // What's new: n on a row shows that tool's notes for its latest version in a popup.
        notes: {
          show: async (id: string) => {
            const row = offered.find((r) => r.id === id);
            if (row) await showRowNotes(runtime, options, row);
          },
          open: (id: string) => {
            const row = offered.find((r) => r.id === id);
            if (row) openUrl(notesTargetFor(runtime, row).link);
          },
          fits: () => fitsPopup(process.stdout.columns ?? 80, process.stdout.rows ?? 24),
          hint: !runtime.selections.whatsNewHidden,
        },
      });
      if (answer === QUIT) return quitNothingChanged(pendingForSelection(offered.filter((r) => picked.includes(r.id))));
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
      if (ready.action === "quit") return quitNothingChanged(collectPending(targets.map((t) => t.scan)));
      targets = ready.targets;
      selectedScans = targets.map((t) => t.scan);
      break;
    }
  }
  if (targets.length === 0) {
    outro(tone.muted(`Nothing to update: nothing was changed.${skipped > 0 ? ` ${skipped} skipped.` : ""}`));
    // Skipped updates did not apply: exit 1, so a scheduled run shows up in its log.
    return { code: skipped > 0 ? 1 : 0, next: "done", pending: collectPending(selectedScans, skippedWhy) };
  }

  process.off("SIGINT", exitCancelled); // applyUpdates handles Ctrl+C from here on
  const outcome = await applyUpdates(selfLast(targets), runtime.latest.cache, runtime.executor);
  process.once("SIGINT", exitCancelled);

  const code = updateExitCode(outcome, skipped);
  // Still to do: manual commands, plus automatic updates that failed or were skipped.
  const pending = leftOverPending(selectedScans, outcome, skippedWhy);
  const line = summaryLine(outcome, summary.upToDate, skipped);
  // The new ccl-caut is installed, but this process still runs the old code: no Rescan.
  const selfUpdated = outcome.updatedIds.includes(SELF_ID);
  const selfLine = selfUpdated ? `${SELF_NAME} updated to ${selfRow?.scan.latestVersion ?? "the new version"}${simulated()}. Run ccl-caut again to use it.` : null;
  if (!interactive || outcome.interrupted) {
    if (selfLine) log.success(tone.done(selfLine));
    outro(line);
    return { code, next: "done", pending };
  }
  log.success(line);
  if (selfLine) log.success(tone.done(selfLine));
  // n: what's new in the tools just updated (not after a self-update: the old code still runs, like r).
  const updatedRows = rowsForWhatsNew(offered, outcome.updatedIds, selfUpdated);
  let next: Awaited<ReturnType<typeof choose<"rescan" | "quit">>>;
  for (;;) {
    next = await choose({
      message: "What next?",
      options: selfUpdated ? [{ value: "quit", label: "Quit" }] : [
        { value: "rescan", label: "Rescan" },
        { value: "quit", label: "Quit" },
      ],
      initialValue: "quit",
      // r rescans like the Rescan option; never after a self-update (the old code still runs).
      rescan: !selfUpdated,
      notes: updatedRows.length > 0,
      notesHint: !runtime.selections.whatsNewHidden,
    });
    if (next !== NOTES) break;
    await notesAfterUpdate(runtime, options, updatedRows);
  }
  if (next === CANCELLED) exitCancelled();
  if (next === "rescan" || next === RESCAN) return { code, next: "rescan" };
  outro(tone.muted("Done."));
  return { code, next: "done", pending };
}

async function runInteractive(runtime: Runtime, options: CliOptions): Promise<{ code: number; pending: PendingItem[] }> {
  for (;;) {
    const round = await interactiveRound(runtime, options);
    if (round.next !== "rescan" && round.next !== "retry") return { code: round.code, pending: round.pending ?? [] };
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
  // --demo --json stays pure JSON (it carries "demo": true instead).
  setDemoMode(options.demo && !options.json);
  const header = headerStyle(options, Boolean(process.stdout.isTTY), process.env);

  if (options.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (options.help) {
    // In a terminal the shared header replaces the help's own title line.
    printHeader(header, VERSION);
    process.stdout.write(helpText(VERSION, header === "none", supportsHyperlinks(process.env, Boolean(process.stdout.isTTY))));
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
  if (options.hideWhatsNew || options.showWhatsNew) {
    runtime.selections.setWhatsNewHidden(options.hideWhatsNew);
    runtime.headerNotes.push(options.hideWhatsNew ? `"n what's new" hint hidden from now on (n still works) · --show-whats-new to show it again` : `"n what's new" hint shown again`);
  }
  // --whats-new covers every tool, whatever the hidden groups.
  if (options.whatsNew) return withDemoFooter(await runWhatsNew(runtime, options, options.whatsNew));
  // --pending (also with --json: the list only) follows the selection and the groups this run shows.
  if (options.pending) return withDemoFooter(await runPending(runtime, options));
  // --json and --discover always cover every group.
  if (options.json) return runJson(runtime, options);
  if (options.discover) return withDemoFooter(await runDiscover(runtime));
  const view = groupView(options, runtime.selections.hiddenGroups);
  runtime.tools = runtime.tools.filter((tool) => view.groups.includes(tool.group));
  runtime.hiddenNote = view.note;
  if (options.check) return withDemoFooter(finish(await runCheck(runtime)));

  const interactive = !options.yes;
  const clear = { interactive, isTTY: Boolean(process.stdout.isTTY), env: process.env, noClear: options.noClear, demo: options.demo };
  if (shouldClearScreen(clear)) clearScreenKeepScrollback();

  // Ctrl+C outside a prompt (e.g. during a scan) exits cleanly too.
  process.once("SIGINT", exitCancelled);
  const run = await runInteractive(runtime, options);
  const code = finish(run.code);
  maybeShowStar(runtime, options);
  // Last (only the demo notice comes after it): the commands still to run.
  process.stdout.write(renderPending(run.pending));
  if (run.pending.length > 0 && demoMode()) process.stdout.write("\n");
  return withDemoFooter(code);
}

/** Once per version, at the end of a normal interactive run: the dim "Star it on GitHub" line. */
function maybeShowStar(runtime: Runtime, options: CliOptions): void {
  const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const show = shouldShowStar({
    version: VERSION,
    lastShown: runtime.selections.starShownVersion,
    interactive: !options.yes,
    isTTY,
    env: process.env,
    demo: options.demo,
  });
  if (!show) return;
  process.stdout.write(`${starLine(supportsHyperlinks(process.env, isTTY))}\n`);
  runtime.selections.markStarShown(VERSION);
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
    // An unexpected internal failure (normal "update failed" results never get here).
    process.stderr.write(`${reportBugLine(supportsHyperlinks(process.env, Boolean(process.stderr.isTTY)))}\n`);
    exitWhenFlushed(1);
  },
);