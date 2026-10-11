# Releasing

## Release candidates (internal testing, repo private)

Release candidates are GitHub pre-releases with the npm tarball attached. **They are never published to npm**; testers install the tarball (see [docs/TESTING.md](docs/TESTING.md)).

```bash
npm version 1.0.0-rc.N --no-git-tag-version   # package.json + lock
git commit -am "Release candidate v1.0.0-rc.N"
git push
git tag -a v1.0.0-rc.N -m "Release candidate v1.0.0-rc.N"
git push origin v1.0.0-rc.N
```

**Actions → Release** classifies the tag (`scripts/release-channel.mjs`: `vX.Y.Z-rc.N` → rc), runs typecheck, tests and build, packs `ccl-caut-X.Y.Z-rc.N.tgz` and creates a GitHub **pre-release** with it attached. Notes come from the `## [X.Y.Z]` section of `CHANGELOG.md` (or `## [Unreleased]`). Stable tags (`vX.Y.Z`) fail before publishing while the repository is private.

The stable launch sets the version to the stable number (`npm version 1.0.0 --no-git-tag-version`, commit); 1.0.0 is published by hand while the repo is private (next section).

## npm while the repository is private (now)

ccl-caut is published to npm **before** the repository goes public. While it is private:

- **Publishes are manual.** The release workflow never publishes to npm from a private repository: a stable or beta tag still creates the GitHub Release (notes from `CHANGELOG.md`) and ends green with the notice "npm publish skipped: repo is private; publish manually". Release candidates are unchanged.
- **The npm README has no repo links.** `README.npm.md` is generated from `README.md` by `scripts/npm-readme.mjs` (a unit test keeps it in sync; `npm run readme:npm` rewrites it). `prepack` swaps it in as `README.md` for the tarball and `postpack` restores the repo README; if a pack fails, the next `npm pack` or `npm test` restores it (`node scripts/pack-readme.mjs restore` does it by hand). The demo GIF ships in the package and is shown from jsDelivr, pinned to the version.
- **package.json** has no `repository` or `bugs` (they would 404); `homepage` is https://creativecodelogic.com. Bugs and feedback go to admin@creativecodelogic.com.
- **No provenance.** npm provenance needs a public repository and the workflow, so manual publishes have none.

### Publishing a version by hand

1. Bump, update `CHANGELOG.md`, commit and push (`npm version x.y.z --no-git-tag-version`). For 1.0.0 this is done.
2. From a clean checkout of `main` at that commit:

   ```bash
   git clone git@github.com:CreativeCodeLogic/ccl-cli-agents-update-tool.git ccl-caut-release
   cd ccl-caut-release
   git log -1 --oneline                 # confirm it is the release commit
   npm ci
   npm pack --dry-run                   # check the file list: dist/, docs/demo.gif, README.md, LICENSE, package.json
   npm login                            # the npm account that is a member of the creativecodelogic org (2FA)
   npm publish --access public          # prepublishOnly: typecheck + tests + build; prepack swaps the npm README in
   npm view ccl-caut version            # -> x.y.z
   git status --short                   # empty: README.md was restored
   ```

3. Check https://www.npmjs.com/package/ccl-caut: README renders, the demo GIF loads (jsDelivr may take a few minutes after the first publish), no links into GitHub.
4. **First publish only: give the org access to the package.** `ccl-caut` is unscoped, so it belongs to the account that published it; grant the org's team access and add co-maintainers:

   ```bash
   npm team ls creativecodelogic                                   # e.g. creativecodelogic:developers
   npm access grant read-write creativecodelogic:developers ccl-caut
   npm owner ls ccl-caut
   ```

   Then on npmjs.com → **ccl-caut → Settings → Publishing access**, choose **Require two-factor authentication and disallow tokens**.
5. **Tag it** so the workflow creates the GitHub Release (it skips npm while private):

   ```bash
   git tag -a vx.y.z -m "Release vx.y.z"
   git push origin vx.y.z
   ```

6. **Smoke test** from a fresh shell outside the repo: `npx ccl-caut@latest --version`, `--check` (exit 0 or 1 is fine), `--discover`. Users of a release candidate see "ccl-caut x.y.z is available · npm i -g ccl-caut" under the banner.

### Publishing a beta

Betas go to the `next` dist-tag, so `npm i -g ccl-caut` and `npx ccl-caut` keep installing the stable version; testers opt in with `ccl-caut@next`.

1. Bump to a prerelease and update `CHANGELOG.md` (`## [X.Y.Z]` section, marked as beta), commit and push:

   ```bash
   npm version X.Y.Z-beta.N --no-git-tag-version
   ```

2. From a clean checkout of that commit:

   ```bash
   npm ci
   npm publish --tag next --dry-run     # check the tag line: "with tag next"
   npm publish --tag next
   npm view ccl-caut dist-tags          # latest unchanged, next -> X.Y.Z-beta.N
   ```

   `prepublishOnly` (`scripts/publish-guard.mjs`) refuses a prerelease without `--tag next` ("Prerelease version: publish with `npm publish --tag next`") and a stable version with `--tag next`.

3. Tag it; the workflow creates a GitHub pre-release with the CHANGELOG notes (npm is skipped while the repo is private):

   ```bash
   git tag -a vX.Y.Z-beta.N -m "Beta vX.Y.Z-beta.N"
   git push origin vX.Y.Z-beta.N
   ```

Beta users see the next beta (or the stable release, whichever is higher) in the update notice, with `npm i -g ccl-caut@next`; stable users are never pointed at a beta.

### Promoting to stable

When the beta has met the bar in ROADMAP.md (full CI matrix, canary, real Windows/macOS/Linux checks, a week without wrong-command or false-success reports):

1. `npm version X.Y.Z --no-git-tag-version`, finalize the `## [X.Y.Z]` CHANGELOG section (date, drop the beta marker), update ROADMAP.md, commit and push.
2. Publish as in "Publishing a version by hand" (no `--tag`: it goes to `latest`; the guard refuses `--tag next` for a stable version).
3. Tag `vX.Y.Z`. Optionally point `next` at the stable version too, so `ccl-caut@next` never lags behind it: `npm dist-tag add ccl-caut@X.Y.Z next`.

## Going public (one time)

Do these in order. Claude never changes repository visibility or publishes to npm; these are manual steps.

1. **Social preview.** Upload `docs/social-preview-b.png`: GitHub → repository **Settings → General → Social preview → Edit → Upload an image**. There is no API for this.

2. **Make the repository public.** GitHub → **Settings → General → Danger Zone → Change repository visibility → Make public**. Then:
   - enable the full CI matrix on push/PR: in `.github/workflows/ci.yml`, replace the `node:` expression with `[20, 22, 24]` and drop the "while the repo is private" comment;
   - enable private vulnerability reporting (used by `SECURITY.md`; GitHub only allows it on public repositories):

   ```bash
   gh api -X PUT repos/CreativeCodeLogic/ccl-cli-agents-update-tool/private-vulnerability-reporting
   ```

   (or **Settings → Code security → Private vulnerability reporting → Enable**).

3. **Undo the private-npm setup** in one commit:
   - `package.json`: restore `"repository": { "type": "git", "url": "git+https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool.git" }` and `"bugs": { "url": "https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/issues" }`; set `homepage` to `https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool#readme`.
   - Drop `README.npm.md`, `scripts/npm-readme.mjs`, `scripts/pack-readme.mjs` (and their `.d.mts`), the `prepack`/`postpack`/`pretest`/`readme:npm` scripts, `test/npm-readme.test.ts`, `.README.repo.md` in `.gitignore`, and `docs/demo.gif` from `files` (the repo README's GIF works on npmjs.com once the repo is public). Remove the "npm while the repository is private" section above.
   - Re-enable provenance: with the repo public, `scripts/release-channel.mjs` lets stable/beta tags publish again, and the workflow publishes with `--provenance` through trusted publishing (next step).
   - Release it as the next patch version (README and metadata changes only).

4. **Configure npm trusted publishing** on npmjs.com → **ccl-caut → Settings → Trusted Publisher → GitHub Actions**:

   | Field | Value |
   | --- | --- |
   | Organization or user | `CreativeCodeLogic` |
   | Repository | `ccl-cli-agents-update-tool` |
   | Workflow filename | `release.yml` |
   | Environment name | *(leave empty)* |

   npm doesn't validate this on save, and a configuration that isn't used for a publish within 2 days expires; set it up right before the next release if needed. No `NPM_TOKEN` secret is needed.

## Cutting a release (after going public)

1. Move the entries under `## [Unreleased]` in `CHANGELOG.md` to a new `## [x.y.z] - YYYY-MM-DD` section and update the compare links at the bottom.
2. Update `ROADMAP.md` (move shipped items to "Now", adjust "Next") and close the matching GitHub milestone. If tools or install methods changed, update the counts in the README why line ("Twelve CLIs. Ten ways to install them.").
3. Bump, tag and push:

   ```bash
   npm version x.y.z -m "Release v%s"   # updates package.json + lock, commits, tags vx.y.z
   git push --follow-tags
   ```

4. **Actions → Release** runs typecheck, tests and build, publishes to npm (only once the repo is public; until then it skips npm and you publish by hand, see above) through trusted publishing (OIDC, with provenance) and creates the GitHub Release. Pre-release versions (`x.y.z-beta.1`) go to the `next` dist-tag and are marked as pre-releases.

Published npm versions are immutable: if something is wrong, fix it and release a new patch version.

### Fallback: publishing with a token

If trusted publishing is unavailable, create a short-lived granular access token on npmjs.com (read/write for `ccl-caut`), add it as the repository secret `NPM_TOKEN`, push the tag, then delete the secret and revoke the token. The workflow uses OIDC when configured and the token only as a fallback.