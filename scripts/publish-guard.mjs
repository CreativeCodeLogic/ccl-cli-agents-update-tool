// prepublishOnly guard: a beta must go to the "next" dist-tag and a stable
// version must not. npm only exports npm_config_tag when it differs from the
// default, so unset means "latest" (verified with npm 12: `--tag latest`
// leaves it unset, and npm itself still accepts a prerelease with it).
//   node scripts/publish-guard.mjs   (reads package.json and npm_config_tag)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Error message, or null when this version may be published with this tag. */
export function checkPublishTag(version, tag) {
  const distTag = tag || "latest";
  const prerelease = /^\d+\.\d+\.\d+-/.test(version);
  if (prerelease && distTag === "latest") return "Prerelease version: publish with `npm publish --tag next`";
  if (!prerelease && distTag === "next") return "Stable version: publish without --tag next (it goes to latest)";
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const error = checkPublishTag(version, process.env.npm_config_tag);
  if (error) {
    console.error(`publish-guard: ${error} (version ${version}, tag ${process.env.npm_config_tag || "latest"})`);
    process.exit(1);
  }
}