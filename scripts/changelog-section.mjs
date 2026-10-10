// Print the CHANGELOG.md section for one version (Keep a Changelog format).
// Usage: node scripts/changelog-section.mjs 0.1.0 > release-notes.md
import { readFileSync } from "node:fs";

const version = process.argv[2];
if (!version) {
  console.error("usage: changelog-section.mjs <version>");
  process.exit(2);
}

const lines = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8").split(/\r?\n/);
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start === -1) {
  console.error(`CHANGELOG.md has no "## [${version}]" section`);
  process.exit(1);
}
const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => line.startsWith("## [") || /^\[[^\]]+\]:\s/.test(line));
const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
if (!body) {
  console.error(`CHANGELOG.md section for ${version} is empty`);
  process.exit(1);
}
process.stdout.write(`${body}\n`);