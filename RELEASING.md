# Releasing

## Going public (one time)

Do these in order. Claude never changes repository visibility or publishes to npm; these are manual steps.

1. **Social preview.** Review `docs/social-preview-a.png` (terminal style) and `docs/social-preview-b.png` (gradient), pick one, and upload it: GitHub → repository **Settings → General → Social preview → Edit → Upload an image**. There is no API for this.

2. **Make the repository public.** GitHub → **Settings → General → Danger Zone → Change repository visibility → Make public**. Then enable private vulnerability reporting (used by `SECURITY.md`; GitHub only allows it on public repositories):

   ```bash
   gh api -X PUT repos/CreativeCodeLogic/ccl-cli-agents-update-tool/private-vulnerability-reporting
   ```

   (or **Settings → Code security → Private vulnerability reporting → Enable**).

3. **Publish 1.0.0 to npm by hand**, from a clean checkout of `main` at the release commit:

   ```bash
   git clone https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool.git ccl-caut-release
   cd ccl-caut-release
   git log -1 --oneline                 # confirm it is the release commit
   npm ci
   npm run build
   npm login                            # the npm account that is a member of the creativecodelogic org (2FA)
   npm publish --access public          # prepublishOnly runs typecheck + tests + build again
   npm view ccl-caut version            # -> 1.0.0
   ```

   A manual publish has no provenance; every later release from the workflow does.

4. **Give the org access to the package.** `ccl-caut` is unscoped, so it belongs to the account that published it; grant the org's team access and add co-maintainers:

   ```bash
   npm team ls creativecodelogic                                   # e.g. creativecodelogic:developers
   npm access grant read-write creativecodelogic:developers ccl-caut
   npm owner ls ccl-caut
   ```

   Then on npmjs.com → **ccl-caut → Settings → Publishing access**, choose **Require two-factor authentication and disallow tokens** (trusted publishing keeps working).

5. **Configure npm trusted publishing** on npmjs.com → **ccl-caut → Settings → Trusted Publisher → GitHub Actions**:

   | Field | Value |
   | --- | --- |
   | Organization or user | `CreativeCodeLogic` |
   | Repository | `ccl-cli-agents-update-tool` |
   | Workflow filename | `release.yml` |
   | Environment name | *(leave empty)* |

   npm doesn't validate this on save, and a configuration that isn't used for a publish within 2 days expires; set it up right before the next release if needed. No `NPM_TOKEN` secret is required.

6. **Tag v1.0.0** so the release workflow creates the GitHub Release:

   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```

   The workflow verifies the tag matches `package.json`, sees that `ccl-caut@1.0.0` is already on npm (`npm view ccl-caut@1.0.0 version` succeeds) and **skips the publish step**, then creates the GitHub Release with the notes from the `## [1.0.0]` section of `CHANGELOG.md`. Watch it under **Actions → Release**.

7. **Smoke test** from a clean terminal on another machine (or a fresh shell outside the repo):

   ```bash
   npx ccl-caut@latest --version     # 1.0.0
   npx ccl-caut@latest --check       # exit 0 or 1 (updates available) is fine
   npx ccl-caut@latest --discover
   ```

## Cutting a release (after 1.0.0)

1. Move the entries under `## [Unreleased]` in `CHANGELOG.md` to a new `## [x.y.z] - YYYY-MM-DD` section and update the compare links at the bottom.
2. Bump, tag and push:

   ```bash
   npm version x.y.z -m "Release v%s"   # updates package.json + lock, commits, tags vx.y.z
   git push --follow-tags
   ```

3. **Actions → Release** runs typecheck, tests and build, publishes to npm through trusted publishing (OIDC, with provenance) and creates the GitHub Release. Pre-release versions (`x.y.z-beta.1`) go to the `next` dist-tag and are marked as pre-releases.

Published npm versions are immutable: if something is wrong, fix it and release a new patch version.

### Fallback: publishing with a token

If trusted publishing is unavailable, create a short-lived granular access token on npmjs.com (read/write for `ccl-caut`), add it as the repository secret `NPM_TOKEN`, push the tag, then delete the secret and revoke the token. The workflow uses OIDC when configured and the token only as a fallback.