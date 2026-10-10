# Releasing

Releases are cut by pushing a version tag. `.github/workflows/release.yml` then runs typecheck, tests and build, checks that the tag matches `package.json`, publishes to npm with provenance, and creates a GitHub Release whose notes come from that version's section in `CHANGELOG.md`.

## One-time setup

### 1. Go public first

npm provenance is not supported for private repositories, and the release workflow publishes with `--provenance`. Make the repository public before the first release.

### 2. npm account

- Use an npm account with 2FA that will own `ccl-caut` (the unscoped name was free on 2026-10-10).
- Optional: create the `creativecodelogic` npm organization and add the package to it later, so more than one person can manage it.

### 3. Bootstrap the first publish

npm trusted publishing (OIDC) is configured on an existing package's settings page, so the very first version has to be published another way. Pick one:

**A. Publish 0.1.0 by hand (simplest)**, from the tagged release commit, before pushing the tag:

```bash
git tag -a v0.1.0 -m "Release v0.1.0"   # package.json is already 0.1.0
npm ci
npm login                                # account with 2FA
npm publish --access public              # prepublishOnly runs typecheck, tests and build
git push origin v0.1.0                   # the workflow skips the publish and creates the GitHub Release
```

**B. Publish 0.1.0 from the workflow with a temporary token:**

1. On npmjs.com create a granular access token with read/write permission for packages (it can be limited to `ccl-caut` once the package exists; for the first publish it needs permission to publish new packages). Set a short expiry.
2. Add it as the repository secret `NPM_TOKEN` (Settings → Secrets and variables → Actions).
3. Tag and push `v0.1.0` (below). The workflow publishes with the token.
4. Delete the `NPM_TOKEN` secret and revoke the token once trusted publishing works (step 4).

### 4. Switch to trusted publishing (OIDC)

On npmjs.com: **ccl-caut → Settings → Trusted Publisher → GitHub Actions**, then fill in:

| Field | Value |
| --- | --- |
| Organization or user | `CreativeCodeLogic` |
| Repository | `ccl-cli-agents-update-tool` |
| Workflow filename | `release.yml` |
| Environment | leave empty (or set one and add `environment:` to the job) |

npm does not validate this when you save it, and an unused configuration expires if it isn't used for a publish within 2 days, so set it up shortly before the next release. Afterwards:

- delete the `NPM_TOKEN` secret if you used option B (the workflow then authenticates with OIDC only);
- optionally, in the package settings, require 2FA and disallow token-based publishing.

The workflow already has `id-token: write` and runs Node 24 with the latest npm (trusted publishing needs npm ≥ 11.5.1 and Node ≥ 22.14).

## Cutting a release

1. Move the entries under `## [Unreleased]` in `CHANGELOG.md` to a new `## [x.y.z] - YYYY-MM-DD` section and update the compare links at the bottom.
2. Bump the version and tag in one step, then push:

   ```bash
   npm version x.y.z -m "Release v%s"   # updates package.json + lock, commits, tags vx.y.z
   git push --follow-tags
   ```

3. Watch **Actions → Release**. Pre-release versions (`x.y.z-beta.1`) are published under the `next` dist-tag and marked as a pre-release on GitHub.

Published npm versions are immutable: if something is wrong, fix it and release a new patch version.