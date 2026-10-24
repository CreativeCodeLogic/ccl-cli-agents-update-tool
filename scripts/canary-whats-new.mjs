// "What's new" canary: runs `ccl-caut --whats-new <id> --json` for every tool whose
// notes are shown in the terminal, and fails only when a MAPPING broke (a vendor
// changed its tag or heading format, or moved its changelog file), not when the
// latest version simply has no notes yet. Network hiccups are warnings.
// Usage: node scripts/canary-whats-new.mjs aider antigravity claude ...
import { spawnSync } from "node:child_process";

const ids = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const VERSION = String.raw`\d+(?:\.\d+)+(?:-[0-9A-Za-z.]+)?`;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function get(url, headers = {}) {
  const res = await fetch(url, { headers: { "user-agent": "ccl-caut-canary", ...headers }, signal: AbortSignal.timeout(20_000) });
  return { status: res.status, text: res.ok ? await res.text() : "" };
}

/** Is the format still in use? A recent release tag (or changelog heading) of that shape. */
async function formatStillUsed(source) {
  if (source.kind === "github-release") {
    const auth = token ? { authorization: `Bearer ${token}` } : {};
    const res = await get(`https://api.github.com/repos/${source.repo}/releases?per_page=50`, { accept: "application/vnd.github+json", ...auth });
    if (res.status !== 200) return { known: false, why: `listing releases: HTTP ${res.status}` };
    const shape = new RegExp(`^${escape(source.tagFormat).replace(escape("<version>"), VERSION)}$`);
    const tags = JSON.parse(res.text).map((r) => r.tag_name);
    return { known: true, used: tags.some((t) => shape.test(t)), why: `recent tags: ${tags.slice(0, 5).join(", ")}` };
  }
  const res = await get(source.url, { range: "bytes=0-131071" });
  if (res.status !== 200 && res.status !== 206) return { known: true, used: false, why: `the file answers HTTP ${res.status}` };
  const shape = new RegExp(source.headingFormat.replace("<version>", VERSION), "m");
  return { known: true, used: shape.test(res.text), why: "no heading of that shape in the first 128 KB" };
}

const broken = [];
for (const id of ids) {
  const run = spawnSync(process.execPath, ["dist/index.js", "--whats-new", id, "--json"], { encoding: "utf8", timeout: 120_000 });
  let result;
  try {
    result = JSON.parse(run.stdout);
  } catch {
    broken.push(`${id}: --whats-new printed no JSON (exit ${run.status}): ${run.stderr.trim().slice(0, 200)}`);
    console.log(`FAIL ${id}: no JSON`);
    continue;
  }
  const where = result.source?.tagFormat ?? result.source?.headingFormat ?? result.source?.url ?? "";
  const line = `${id.padEnd(11)} ${String(result.version || "?").padEnd(16)} ${result.state.padEnd(6)} ${where}`;
  if (result.state === "ready") {
    console.log(`ok   ${line} (${result.notes.length} chars${result.truncated ? ", cut" : ""})`);
    continue;
  }
  if (!result.version) {
    console.log(`warn ${line}: latest version unknown, mapping not checked`);
    console.log(`::warning title=${id}::latest version unknown; the notes mapping was not checked`);
    continue;
  }
  if (result.state === "error" && result.source?.kind === "github-release") {
    console.log(`warn ${line}: ${result.error}`);
    console.log(`::warning title=${id}::${result.error}`);
    continue;
  }
  // No notes (or the changelog could not be read): is the format itself still alive?
  const check = await formatStillUsed(result.source).catch((error) => ({ known: false, why: String(error) }));
  if (!check.known) {
    console.log(`warn ${line}: could not check the format (${check.why})`);
    console.log(`::warning title=${id}::could not check the notes format (${check.why})`);
  } else if (check.used && result.state === "none") {
    console.log(`ok   ${line}: no notes for ${result.version} yet; the format is still in use`);
    console.log(`::notice title=${id}::no release notes for ${result.version} (the format is still in use)`);
  } else {
    broken.push(`${id}: mapping broken (${result.state}${result.error ? `: ${result.error}` : ""}; ${check.why}) for ${where}`);
    console.log(`FAIL ${line}: ${check.why}`);
  }
}

if (broken.length > 0) {
  for (const b of broken) console.log(`::error::${b}`);
  process.exit(1);
}
