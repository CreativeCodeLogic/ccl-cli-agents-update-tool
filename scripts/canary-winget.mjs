// Canary for winget plans: reads `ccl-caut --json` output for one tool installed
// per-user with winget.
// Usage: node scripts/canary-winget.mjs scan.json <tool> plan        prints auto | waiting | manual (and checks it)
//        node scripts/canary-winget.mjs scan.json <tool> upgraded <before-version>
import { readFileSync } from "node:fs";

const [file, id, mode, before] = process.argv.slice(2);
const tool = JSON.parse(readFileSync(file, "utf8")).tools?.find((t) => t.id === id);
const fail = (message) => {
  console.error(`::error::${id}: ${message}`);
  console.error(JSON.stringify(tool, null, 2));
  process.exit(1);
};
if (!tool?.installed) fail("not detected");
if (tool.installMethod !== "winget") fail(`install method ${tool.installMethod}, expected winget`);
console.error(`${id}: ${tool.installedVersion} -> ${tool.latestVersion} (${tool.state}); plan ${JSON.stringify(tool.plan)}${tool.compatibility ? `; ${tool.compatibility}` : ""}`);

if (mode === "plan") {
  const plan = tool.plan;
  if (plan?.kind === "auto") {
    const flags = ["--exact", "--source", "winget", "--scope", "user", "--silent", "--accept-source-agreements", "--accept-package-agreements", "--disable-interactivity"];
    if (plan.command[0] !== "winget" || plan.command[1] !== "upgrade" || !flags.every((f) => plan.command.includes(f))) fail("auto plan is not the documented winget command");
    process.stdout.write("auto\n");
  } else if (plan?.kind === "manual" && tool.compatibility?.includes("waiting for winget")) {
    process.stdout.write("waiting\n");
  } else if (plan?.kind === "manual") {
    process.stdout.write("manual\n");
  } else fail("no plan");
} else if (mode === "upgraded") {
  if (!tool.installedVersion || tool.installedVersion === before) fail(`still ${tool.installedVersion} after ccl-caut --yes`);
  console.error(`upgraded by ccl-caut: ${before} -> ${tool.installedVersion}`);
} else {
  console.error("usage: canary-winget.mjs scan.json <tool> plan|upgraded <before>");
  process.exit(2);
}