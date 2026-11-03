// npm 12 canary: after `ccl-caut --yes` updated the npm-distributed CLIs (installed
// one version back), every tool must be on the version ccl-caut aimed for, not
// marked broken, and its command must actually start. npm 12 skips install scripts
// it wasn't told to allow and still exits 0, so "the update command succeeded" proves nothing.
//
// The target is the latest version ccl-caut saw BEFORE updating (before.json): some
// vendors publish several times a day (Amp's versions are build timestamps), so the
// latest seen by the check afterwards can be newer than anything the update could
// have installed. That is a notice, not a failure.
// Usage: node scripts/canary-npm12.mjs before.json after.json yes.log <tool-id> [<tool-id> ...]
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [beforeFile, afterFile, logFile, ...ids] = process.argv.slice(2);
const before = JSON.parse(readFileSync(beforeFile, "utf8"));
const after = JSON.parse(readFileSync(afterFile, "utf8"));
const log = readFileSync(logFile, "utf8");
const problems = [];

/** -1, 0, 1 by the numeric version core (1.2.3 or 0.0.1793606440), then the full string. */
function compareVersions(a, b) {
  const core = (v) => String(v).split("-")[0].split(".").map((n) => Number(n) || 0);
  const [x, y] = [core(a), core(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  return a === b ? 0 : String(a) < String(b) ? -1 : 1;
}

for (const id of ids) {
  const tool = after.tools.find((t) => t.id === id);
  const target = before.tools.find((t) => t.id === id)?.latestVersion ?? null;
  if (!tool?.installed) {
    problems.push(`${id}: not detected after the update`);
    continue;
  }
  const run = spawnSync(`"${tool.binaryPath}" --version`, { encoding: "utf8", shell: true, timeout: 120_000 });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split(/\r?\n/)[0]?.slice(0, 120) ?? "";
  const runs = run.status === 0;
  console.log(`${id.padEnd(9)} ${String(tool.installedVersion).padEnd(14)} target ${String(target).padEnd(14)} latest now ${String(tool.latestVersion).padEnd(14)} runs=${runs} broken=${Boolean(tool.broken)} | ${out}`);
  if (!runs) problems.push(`${id}: ${tool.binaryPath} --version failed (exit ${run.status}): ${out}`);
  if (tool.broken) problems.push(`${id}: ccl-caut reports it broken: ${tool.broken.reason}`);
  if (target && compareVersions(tool.installedVersion, target) < 0) {
    problems.push(`${id}: still on ${tool.installedVersion}, ccl-caut was updating it to ${target}`);
  } else if (tool.latestVersion && compareVersions(tool.installedVersion, tool.latestVersion) < 0) {
    console.log(`::notice title=${id}::${id} ${tool.latestVersion} was published during the run; ${tool.installedVersion} (the latest when ccl-caut updated it) is installed.`);
  }
}
// ccl-caut must say so itself when it leaves a tool broken (never "updated" or "unchanged").
const reported = log.match(/^.*is BROKEN.*$/gm) ?? [];
for (const r of reported) console.log(`ccl-caut reported: ${r.trim()}`);

if (problems.length > 0) {
  for (const p of problems) console.log(`::error::${p}`);
  process.exit(1);
}
console.log(`All ${ids.length} npm CLIs updated and run.`);
