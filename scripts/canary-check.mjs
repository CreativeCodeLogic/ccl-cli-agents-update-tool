// Canary assertions: every listed tool must be detected with the expected install
// method (default npm), a parsed installed version and a resolved latest version.
// Usage: node scripts/canary-check.mjs scan.json claude codex aider=uv vibe=pipx ...
import { readFileSync } from "node:fs";

const [file, ...specs] = process.argv.slice(2);
let report;
try {
  report = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(`::error::could not read ${file}: ${error}`);
  process.exit(1);
}

const problems = [];
for (const spec of specs) {
  const [id, expected = "npm"] = spec.split("=");
  const tool = report.tools?.find((t) => t.id === id);
  const issues = [];
  if (!tool) issues.push("not in the registry");
  else {
    if (!tool.installed) issues.push("not detected");
    if (tool.installed && tool.installMethod !== expected) issues.push(`install method ${tool.installMethod}, expected ${expected}`);
    if (tool.installed && !tool.installedVersion) issues.push("installed version not parsed");
    if (!tool.latestVersion) issues.push("latest version not resolved");
  }
  const line = `${id.padEnd(9)} ${tool?.installMethod ?? "-"} ${tool?.installedVersion ?? "-"} -> ${tool?.latestVersion ?? "-"} (${tool?.binaryPath ?? "no binary"})`;
  if (issues.length > 0) {
    problems.push(`${id}: ${issues.join(", ")}`);
    console.log(`FAIL ${line}`);
  } else {
    console.log(`ok   ${line}`);
  }
}

if (report.network?.failures?.length) console.log(`network failures: ${JSON.stringify(report.network.failures)}`);
if (problems.length > 0) {
  for (const p of problems) console.error(`::error::${p}`);
  process.exit(1);
}
console.log(`All ${specs.length} tools detected as expected.`);