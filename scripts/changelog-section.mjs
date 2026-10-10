// Print the CHANGELOG.md section for a version (Keep a Changelog format).
// Pre-releases fall back to their base version's section, then to [Unreleased].
// Usage: node scripts/changelog-section.mjs 1.0.0-rc.1 > release-notes.md
import { readFileSync } from "node:fs";

const version = process.argv[2];
if (!version) {
  console.error("usage: changelog-section.mjs <version>");
  process.exit(2);
}

const lines = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8").split(/\r?\n/);

function section(name) {
  const start = lines.findIndex((line) => line.startsWith(`## [${name}]`));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## [") || /^\[[^\]]+\]:\s/.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return body || null;
}

const base = version.replace(/-.*$/, "");
const candidates = version === base ? [version] : [version, base, "Unreleased"];
for (const name of candidates) {
  const body = section(name);
  if (body) {
    process.stdout.write(`${body}\n`);
    process.exit(0);
  }
}
console.error(`CHANGELOG.md has no non-empty section for ${candidates.join(", ")}`);
process.exit(1);