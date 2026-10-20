// Canary for Python compatibility: a tool installed on a Python its latest
// release doesn't support must get the manual reinstall plan; after running
// that command it must be up to date.
// Usage: node scripts/canary-compat.mjs scan.json <tool> plan        prints the planned command
//        node scripts/canary-compat.mjs scan.json <tool> up-to-date  checks the reinstall worked
import { readFileSync } from "node:fs";

const [file, id, mode] = process.argv.slice(2);
const report = JSON.parse(readFileSync(file, "utf8"));
const tool = report.tools?.find((t) => t.id === id);
const fail = (message) => {
  console.error(`::error::${id}: ${message}`);
  console.error(JSON.stringify(tool, null, 2));
  process.exit(1);
};
if (!tool?.installed) fail("not detected");
console.error(`${id}: ${tool.installMethod} ${tool.installedVersion} -> ${tool.latestVersion} (${tool.state})`);
if (mode === "plan") {
  if (!tool.compatibility) fail("expected a compatibility note (latest release needs another Python)");
  if (tool.plan?.kind !== "manual") fail(`expected a manual plan, got ${JSON.stringify(tool.plan)}`);
  console.error(`note: ${tool.compatibility}`);
  process.stdout.write(`${tool.plan.command}\n`);
} else if (mode === "up-to-date") {
  if (tool.state !== "up-to-date") fail(`expected up-to-date after the reinstall, got ${tool.state}`);
  if (tool.compatibility) fail(`unexpected compatibility note: ${tool.compatibility}`);
} else {
  console.error("usage: canary-compat.mjs scan.json <tool> plan|up-to-date");
  process.exit(2);
}