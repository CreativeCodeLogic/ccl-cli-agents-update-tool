// Decides what a pushed tag may do. Used by .github/workflows/release.yml.
//   stable: vX.Y.Z             -> npm publish (latest) + GitHub Release
//   rc:     vX.Y.Z-rc.N        -> GitHub pre-release with the .tgz; NEVER npm
//   beta:   vX.Y.Z-<other pre> -> npm publish (next) + GitHub pre-release
//   anything else is rejected.
// Usage: node scripts/release-channel.mjs <tag>   (prints GitHub step outputs)

const STABLE = /^v(\d+)\.(\d+)\.(\d+)$/;
const RC = /^v(\d+)\.(\d+)\.(\d+)-rc\.(\d+)$/;
const PRERELEASE = /^v(\d+)\.(\d+)\.(\d+)-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)$/;

/** @returns {{ channel: "stable" | "rc" | "beta"; version: string; publishToNpm: boolean } | null} */
export function classifyTag(tag) {
  if (STABLE.test(tag)) return { channel: "stable", version: tag.slice(1), publishToNpm: true };
  if (RC.test(tag)) return { channel: "rc", version: tag.slice(1), publishToNpm: false };
  if (PRERELEASE.test(tag)) {
    // Any rc-looking prerelease that isn't exactly -rc.N is rejected rather than published as a beta.
    if (/-rc/i.test(tag)) return null;
    return { channel: "beta", version: tag.slice(1), publishToNpm: true };
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("release-channel.mjs")) {
  const tag = process.argv[2] ?? "";
  const result = classifyTag(tag);
  if (!result) {
    console.error(`::error::tag "${tag}" is not a release tag (vX.Y.Z, vX.Y.Z-rc.N or vX.Y.Z-<prerelease>)`);
    process.exit(1);
  }
  console.log(`channel=${result.channel}`);
  console.log(`version=${result.version}`);
  console.log(`publish_to_npm=${result.publishToNpm}`);
}