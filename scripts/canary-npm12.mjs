// npm 12 canary: after `ccl-caut --yes` updated the npm-distributed CLIs (installed
// one version back), every tool must be on its latest version, not marked broken,
// and its command must actually start. npm 12 skips install scripts it wasn't told
// to allow and still exits 0, so "the update command succeeded" proves nothing.
// Usage: node scripts/canary-npm12.mjs after.json yes.log <tool-id> [<tool-id> ...]
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [scanFile, logFile, ...ids] = process.argv.slice(2);
const scan = JSON.parse(readFileSync(scanFile, "utf8"));
const log = readFileSync(logFile, "utf8");
const problems = [];

for (const id of ids) {
  const tool = scan.tools.find((t) => t.id === id);
  if (!tool?.installed) {
    problems.push(`${id}: not detected after the update`);
    continue;
  }
  const run = spawnSync(`"${tool.binaryPath}" --version`, { encoding: "utf8", shell: true, timeout: 120_000 });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split(/\r?\n/)[0]?.slice(0, 120) ?? "";
  const runs = run.status === 0;
  const line = `${id.padEnd(9)} ${String(tool.installedVersion).padEnd(14)} latest ${String(tool.latestVersion).padEnd(14)} runs=${runs} broken=${Boolean(tool.broken)} | ${out}`;
  console.log(line);
  if (!runs) problems.push(`${id}: ${tool.binaryPath} --version failed (exit ${run.status}): ${out}`);
  if (tool.broken) problems.push(`${id}: ccl-caut reports it broken: ${tool.broken.reason}`);
  if (tool.latestVersion && tool.installedVersion !== tool.latestVersion) problems.push(`${id}: still on ${tool.installedVersion}, latest is ${tool.latestVersion}`);
}
// ccl-caut must say so itself when it leaves a tool broken (never "updated" or "unchanged").
const reported = log.match(/^.*is BROKEN.*$/gm) ?? [];
for (const r of reported) console.log(`ccl-caut reported: ${r.trim()}`);

if (problems.length > 0) {
  for (const p of problems) console.log(`::error::${p}`);
  process.exit(1);
}
console.log(`All ${ids.length} npm CLIs updated and run.`);
