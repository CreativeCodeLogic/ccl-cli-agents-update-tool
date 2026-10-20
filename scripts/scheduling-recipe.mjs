// Prints a recipe from docs/scheduling.md with the example paths replaced by
// this machine's, so CI runs exactly the documented commands.
// Usage: node scripts/scheduling-recipe.mjs <cron-path|cron-command|plist|plist-path|plist-command>
//        node scripts/scheduling-recipe.mjs check-log <log file> <number of runs>
// The example paths assume an nvm-style layout: <prefix>/bin/node and
// <prefix>/lib/node_modules, which is what a global install under the running Node gives.
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DOC = new URL("../docs/scheduling.md", import.meta.url);

/** The fenced block right after `<!-- snippet: name -->`. */
export function extractSnippet(markdown, name) {
  const lines = markdown.split(/\r?\n/);
  const marker = lines.indexOf(`<!-- snippet: ${name} -->`);
  if (marker === -1 || !lines[marker + 1]?.startsWith("```")) throw new Error(`snippet "${name}" not found`);
  const end = lines.indexOf("```", marker + 2);
  if (end === -1) throw new Error(`snippet "${name}" is not closed`);
  return lines.slice(marker + 2, end).join("\n");
}

/** The crontab snippet: its PATH line and the job's command (after the five time fields). */
export function parseCron(snippet) {
  const pathLine = snippet.split("\n").find((l) => l.startsWith("PATH="));
  const job = snippet.split("\n").find((l) => /^[0-9*]/.test(l));
  if (!pathLine || !job) throw new Error("cron snippet needs a PATH= line and a job line");
  const fields = job.split(/\s+/);
  return { path: pathLine.slice("PATH=".length), schedule: fields.slice(0, 5).join(" "), command: fields.slice(5).join(" ") };
}

/** The plist's `/bin/sh -c` command and PATH. */
export function parsePlist(snippet) {
  const strings = [...snippet.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
  const c = strings.indexOf("-c");
  const keyPath = snippet.indexOf("<key>PATH</key>");
  const pathValue = /<string>([^<]*)<\/string>/.exec(snippet.slice(keyPath))?.[1];
  if (c === -1 || !pathValue) throw new Error("plist snippet needs /bin/sh -c and a PATH");
  return { command: strings[c + 1], path: pathValue };
}

/** Replace the documented example paths with this machine's. */
export function localize(text, { prefix, home }) {
  return text
    .replaceAll("/home/you/.nvm/versions/node/v22.19.0", prefix)
    .replaceAll("/Users/you/.nvm/versions/node/v22.19.0", prefix)
    .replaceAll("/home/you", home)
    .replaceAll("/Users/you", home);
}

/**
 * Checks a log written by the recipes: `runs` blocks, each ending in "exit 0"
 * or "exit 1", a scan in each, and plain text only (no escape codes).
 */
export function checkLog(text, runs) {
  const problems = [];
  const exits = [...text.matchAll(/^exit (\d+)$/gm)].map((m) => Number(m[1]));
  if (exits.length !== runs) problems.push(`expected ${runs} "exit N" lines, found ${exits.length}`);
  if (exits.some((code) => code !== 0 && code !== 1)) problems.push(`unexpected exit codes: ${exits.join(", ")}`);
  const scans = text.match(/supported CLIs/g)?.length ?? 0;
  if (scans !== runs) problems.push(`expected ${runs} scans, found ${scans}`);
  if (text.includes(String.fromCharCode(27))) problems.push("the log contains escape codes");
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const doc = readFileSync(DOC, "utf8");
  const where = { prefix: path.dirname(path.dirname(process.execPath)), home: os.homedir() };
  const what = process.argv[2];
  if (what === "check-log") {
    const problems = checkLog(readFileSync(process.argv[3], "utf8"), Number(process.argv[4] ?? 1));
    for (const p of problems) console.error(`::error::${p}`);
    process.exit(problems.length > 0 ? 1 : 0);
  }
  const out = {
    "cron-path": () => parseCron(extractSnippet(doc, "cron")).path,
    "cron-command": () => parseCron(extractSnippet(doc, "cron")).command,
    plist: () => extractSnippet(doc, "plist"),
    "plist-path": () => parsePlist(extractSnippet(doc, "plist")).path,
    "plist-command": () => parsePlist(extractSnippet(doc, "plist")).command,
  }[what];
  if (!out) {
    console.error("usage: scheduling-recipe.mjs <cron-path|cron-command|plist|plist-path|plist-command>");
    process.exit(2);
  }
  process.stdout.write(`${localize(out(), where)}\n`);
}