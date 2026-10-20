# Releasing

Releases are **staged by pushing a tag** and **published when a maintainer approves them** on npmjs.com. The Release workflow (`.github/workflows/release.yml`) runs typecheck, tests and build, then, depending on the tag (`scripts/release-channel.mjs`):

| Tag | npm | GitHub |
| --- | --- | --- |
| `vX.Y.Z` | staged for `latest`, with provenance | Release |
| `vX.Y.Z-beta.N` (any prerelease except rc) | staged for `next`, with provenance | pre-release |
| `vX.Y.Z-rc.N` | never | pre-release with the `.tgz` attached |

The workflow runs `npm stage publish --provenance --tag <next|latest>` through npm trusted publishing (OIDC): no npm token exists anywhere, and the trusted publisher only allows staging. A staged version is not installable until a maintainer approves it with 2FA. The dist-tag is fixed when the version is staged. A version that is already on npm is skipped cleanly (`npm view` first); release notes come from the `## [X.Y.Z…]` section of `CHANGELOG.md`.

The GitHub Release is created as soon as the version is staged (GitHub can't see the npm approval), with a first line saying the npm version awaits maintainer approval; remove that line after approving (see step 5 below).

**Tags are permanent.** The "Protect release tags" ruleset forbids moving or deleting `v*` tags, so check the commit (CI green, version in `package.json`, CHANGELOG section) before you push a tag. If staging fails, don't push another tag for the same version: fix the cause, bump to the next prerelease number, and release that.

References: [Staged publishing](https://docs.npmjs.com/staged-publishing/), [`npm stage`](https://docs.npmjs.com/cli/commands/npm-stage), [Trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## npm settings (configured)

On npmjs.com, **ccl-caut → Settings**:

- **Trusted Publisher → GitHub Actions:** organization `CreativeCodeLogic`, repository `ccl-cli-agents-update-tool`, workflow `release.yml`, no environment. Allowed actions: **only `npm stage publish`** ("Allow npm publish" and "Allow npm dist-tag" unchecked).
- **Publishing access:** require two-factor authentication and disallow tokens.

A newly saved trusted publisher must be used by a successful publish within 2 days, or it expires and has to be created again.

## Releasing a version (beta or stable)

1. **Bump and describe it**, commit, push, and wait for CI to be green:

   ```bash
   npm version X.Y.Z-beta.N --no-git-tag-version      # or X.Y.Z for a stable release
   # CHANGELOG.md: a "## [X.Y.Z-beta.N] - YYYY-MM-DD" section
   git commit -am "Release vX.Y.Z-beta.N"
   git push
   ```

2. **Tag that exact commit** (check `git log -1` and `package.json` first; tags can't be moved):

   ```bash
   git tag -a vX.Y.Z-beta.N -m "Release vX.Y.Z-beta.N"
   git push origin vX.Y.Z-beta.N
   ```

3. **Watch Actions → Release.** The "Stage the npm release" step prints `+ ccl-caut@X.Y.Z-beta.N (staged)` and the run summary repeats the approval steps.

4. **Approve on npmjs.com** (a maintainer with 2FA):
   1. Sign in to npmjs.com and open the **ccl-caut** package page.
   2. Open the **Staged Packages** tab.
   3. Check the staged version (number, dist-tag `next` or `latest`, provenance from this repository and the release commit).
   4. Click **Approve** and confirm with your 2FA code.

   CLI alternative: `npm stage list ccl-caut`, `npm stage view <stage-id>`, `npm stage approve <stage-id>` (prompts for 2FA). To throw a staged version away instead: **Reject** (or `npm stage reject <stage-id>`).

5. **Verify**, then update the GitHub Release:

   ```bash
   npm view ccl-caut dist-tags              # the new version on next (beta) or latest (stable)
   npx ccl-caut@next --version              # beta; or npx ccl-caut@latest for stable
   ```

   The npm page shows the provenance badge. Edit the GitHub Release and delete the "awaits maintainer approval" first line.

For a **stable** release, also finalize the CHANGELOG section (date, no beta marker), update ROADMAP.md (and the README why-line counts if tools or install methods changed) and close the milestone before step 1. After approving a stable release, point `next` at it so `ccl-caut@next` never lags behind `latest`: `npm dist-tag add ccl-caut@X.Y.Z next` (by hand with 2FA; the trusted publisher can only stage). Dependency updates (Dependabot) need no release of their own; see CONTRIBUTING.md.

Beta users are told about the next beta or the stable release, whichever is newer; stable users are never pointed at a beta.
## Release candidates

`vX.Y.Z-rc.N` tags never publish to npm: they create a GitHub pre-release with the packed `.tgz` attached, for testing a build before it reaches npm (see [docs/TESTING.md](docs/TESTING.md)).

## Fallback: publishing by hand

Only if the workflow can't stage at all. Manual publishes have no provenance and need your 2FA (`npm publish` prompts for it).

```bash
git clone https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool.git ccl-caut-release
cd ccl-caut-release && git checkout vX.Y.Z      # the tagged commit
npm ci
npm publish --dry-run --tag next                 # betas: --tag next; stable: no --tag
npm publish --tag next
```

`prepublishOnly` runs typecheck, tests and build, and `scripts/publish-guard.mjs` refuses a prerelease without `--tag next` and a stable version with it. Tag the commit as usual: the workflow then sees the version on npm, skips publishing and creates the GitHub Release.
