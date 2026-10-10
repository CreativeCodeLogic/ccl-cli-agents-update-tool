// Builds README.npm.md, the README shipped in the npm package, from README.md.
// While the GitHub repository is private, every repo link and relative path would 404 on
// npmjs.com, so this keeps only the user-facing sections and rewrites what they link to.
// The demo GIF ships in the package and is served by jsDelivr, pinned to the exact version.
//
//   node scripts/npm-readme.mjs          write README.npm.md
//   node scripts/npm-readme.mjs --check  exit 1 if README.npm.md is out of date
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const NPM_README = join(root, "README.npm.md");
const CONTACT = "admin@creativecodelogic.com";

/** Sections (by "## " heading) that make it into the npm README, in repo order. */
const KEEP = ["Quick start", "What it looks like", "Supported tools", "Safe by design", "Usage", "License"];

export function buildNpmReadme(readme, version) {
  const [head, ...sections] = readme.split(/^(?=## )/m);
  const footer = sections.length ? sections[sections.length - 1].split(/^---$/m)[1] ?? "" : "";

  let intro = head
    .split("\n")
    .filter((line) => !line.startsWith("[![")) // badges link to the repo
    .join("\n")
    .replace(/\(docs\/demo\.gif\)/, `(https://cdn.jsdelivr.net/npm/ccl-caut@${version}/docs/demo.gif)`)
    .replace(/<sub>Recorded with[^\n]*<\/sub>/, "<sub>Recorded with `ccl-caut --demo` (fixture data, nothing real is updated).</sub>")
    .replace(/\n{3,}/g, "\n\n");

  const body = sections
    .filter((s) => KEEP.includes(s.split("\n")[0].slice(3).trim()))
    .map((s) => {
      let text = s.split(/^---$/m)[0];
      const title = text.split("\n")[0].slice(3).trim();
      if (title === "Quick start") text = text.replace(/From source:\n\n```bash\n[\s\S]*?```\n\n/, "");
      if (title === "License") {
        text = text.replace("See [LICENSE](LICENSE).", "See the LICENSE file in the package.");
        text =
          `## Feedback\n\nFound a bug or have an idea? Email [${CONTACT}](mailto:${CONTACT}) with your ` +
          "OS, terminal, `node --version`, `ccl-caut --version` and the `ccl-caut --json` output " +
          "(redact your username in paths).\n\n" +
          text;
      }
      return text.trimEnd() + "\n\n";
    })
    .join("");

  const out = `${intro.trimEnd()}\n\n${body}---\n${footer.trimEnd()}\n`.replace(/\n{3,}/g, "\n\n");
  assertNoRepoLinks(out);
  return out;
}

/** Throws when the npm README still points at the (private) repository or at relative paths. */
export function assertNoRepoLinks(text) {
  const bad = [];
  if (/github\.com\/CreativeCodeLogic/i.test(text)) bad.push("a github.com/CreativeCodeLogic link");
  for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
    if (!/^(https?:|mailto:|#)/.test(m[1])) bad.push(`relative link ${m[1]}`);
  }
  for (const m of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (!/^(https?:|mailto:|#)/.test(m[1])) bad.push(`relative link ${m[1]}`);
  }
  if (bad.length) throw new Error(`README.npm.md must not contain ${bad.join(", ")}`);
}

export function currentNpmReadme() {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return buildNpmReadme(readme, version);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const next = currentNpmReadme();
  if (process.argv.includes("--check")) {
    let now = "";
    try {
      now = readFileSync(NPM_README, "utf8");
    } catch {}
    if (now !== next) {
      console.error("README.npm.md is out of date: run node scripts/npm-readme.mjs");
      process.exit(1);
    }
  } else {
    writeFileSync(NPM_README, next);
    console.log("wrote README.npm.md");
  }
}