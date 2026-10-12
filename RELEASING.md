# Releasing

Releases are published **by pushing a tag**. The Release workflow (`.github/workflows/release.yml`) runs typecheck, tests and build, then, depending on the tag (`scripts/release-channel.mjs`):

| Tag | npm | GitHub |
| --- | --- | --- |
| `vX.Y.Z` | publish to `latest`, with provenance | Release |
| `vX.Y.Z-beta.N` (any prerelease except rc) | publish to `next`, with provenance | pre-release |
| `vX.Y.Z-rc.N` | never | pre-release with the `.tgz` attached |

A version that is already on npm is skipped cleanly (`npm view` first); the GitHub Release is still created. Release notes come from the `## [X.Y.Z…]` section of `CHANGELOG.md`.

**Tags are permanent.** The "Protect release tags" ruleset forbids moving or deleting `v*` tags, so check the commit (CI green, version in `package.json`, CHANGELOG section) before you push a tag.

## One-time setup: npm trusted publishing

The workflow publishes through npm's trusted publishing (OIDC), so no npm token is stored in GitHub. On npmjs.com, open **ccl-caut → Settings → Trusted Publisher → GitHub Actions** and enter:

| Field | Value |
| --- | --- |
| Organization or user | `CreativeCodeLogic` |
| Repository | `ccl-cli-agents-update-tool` |
| Workflow filename | `release.yml` |
| Environment name | *(leave empty)* |

Then, under **Settings → Publishing access**, choose **Require two-factor authentication and disallow tokens**: the workflow keeps publishing through OIDC, and nobody can publish with a stolen token.

The workflow already has what trusted publishing needs: `id-token: write` on the release job only, Node 24 and the latest npm.

## Publishing a beta

Betas go to the `next` dist-tag, so `npm i -g ccl-caut` keeps installing the stable version and testers opt in with `ccl-caut@next`.

1. Bump and describe it, commit, push, and wait for CI:

   ```bash
   npm version X.Y.Z-beta.N --no-git-tag-version
   # CHANGELOG.md: a "## [X.Y.Z-beta.N] - YYYY-MM-DD" section
   git commit -am "Release vX.Y.Z-beta.N"
   git push
   ```

2. Tag that exact commit:

   ```bash
   git tag -a vX.Y.Z-beta.N -m "Release vX.Y.Z-beta.N"
   git push origin vX.Y.Z-beta.N
   ```

3. Watch **Actions → Release**, then check:

   ```bash
   npm view ccl-caut dist-tags        # next -> X.Y.Z-beta.N, latest unchanged
   ```

   The npm page shows the provenance badge for the version.

Beta users are told about the next beta or the stable release, whichever is newer; stable users are never pointed at a beta.

## Promoting to stable

When the beta meets the bar in ROADMAP.md (full CI matrix, canary, real Windows/macOS/Linux checks, a week with no wrong-command or false-success reports):

1. `npm version X.Y.Z --no-git-tag-version`, finalize the `## [X.Y.Z]` CHANGELOG section, update ROADMAP.md (and the README why-line counts if tools or install methods changed), close the milestone, commit, push, wait for CI.
2. Tag `vX.Y.Z` and push the tag: the workflow publishes to `latest` with provenance and creates the GitHub Release.
3. Optionally point `next` at the stable version too, so `ccl-caut@next` never lags behind it: `npm dist-tag add ccl-caut@X.Y.Z next`.

## Release candidates

`vX.Y.Z-rc.N` tags never publish to npm: they create a GitHub pre-release with the packed `.tgz` attached, for testing a build before it reaches npm (see [docs/TESTING.md](docs/TESTING.md)).

## Fallback: publishing by hand

Only if the workflow can't publish (for example while trusted publishing is being set up). Manual publishes have no provenance.

```bash
git clone https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool.git ccl-caut-release
cd ccl-caut-release && git checkout vX.Y.Z      # the tagged commit
npm ci
npm publish --dry-run --tag next                 # betas: --tag next; stable: no --tag
npm publish --tag next
```

`prepublishOnly` runs typecheck, tests and build, and `scripts/publish-guard.mjs` refuses a prerelease without `--tag next` and a stable version with it. Tag the commit as usual: the workflow then sees the version on npm, skips publishing and creates the GitHub Release.
### Last resort: a token in the workflow

If trusted publishing is unavailable and publishing by hand is not an option: temporarily allow tokens under **Publishing access**, create a short-lived granular access token (read/write for `ccl-caut`), add it as the repository secret `NPM_TOKEN`, push the tag, then delete the secret, revoke the token and switch back to **Require two-factor authentication and disallow tokens**. The workflow uses OIDC when it is configured and the token only as a fallback.
