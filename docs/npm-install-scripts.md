# npm 12 and install scripts

npm 12 (12.0.0, 2026-07-08) no longer runs dependency install scripts (`preinstall`, `install`, `postinstall`) unless a policy allows them, and that includes `npm install -g`. A blocked install still exits 0: npm only prints a warning at the end.

```
npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:
npm warn install-scripts   @anthropic-ai/claude-code@2.1.312 (postinstall: node install.cjs)
```

## How CCL CAUT handles it

- **Which policy applies to a global install.** A global install has no `package.json`, so npm reads only the `allow-scripts` config. That config comes from the `--allow-scripts` flag or from `.npmrc` (user and global).
- **The flag replaces `.npmrc`.** The first layer that has a value wins for the whole install (`resolve-allow-scripts.js`), and npm says ".npmrc allow-scripts setting is being ignored because --allow-scripts was passed". CCL CAUT therefore passes your own list plus the one package it needs: `--allow-scripts=<your list>,<package>`.
- **Which npm versions get the flag.** `--allow-scripts` exists from npm 11.16.0, where policy support began; scripts still run by default there. Older npm only warns "Unknown cli config", so CCL CAUT never passes the flag before 11.16.0.
- **Your deny is never overridden.** `ignore-scripts=true` beats `--allow-scripts`, and it is the only way to deny install scripts for global installs: `"pkg": false` denials live in a project's `package.json` and don't apply to `-g`. With it set, CCL CAUT doesn't update the tool. It gives you a one-time command instead: `npm install -g --ignore-scripts=false --allow-scripts=<package> <package>@latest`.
- **How CCL CAUT reads your settings.** It runs `npm config get allow-scripts ignore-scripts dangerously-allow-all-scripts`, which prints `key=value` lines.

## Per tool (npm-distributed CLIs, checked 2026-10-28)

Install scripts were found with `npm install <pkg>@latest --package-lock-only --ignore-scripts` (registry metadata only; nothing runs) and read from each package's files.

| Tool | Package | Own install script | Needed to run? | Dependencies with install scripts | Needed? |
|---|---|---|---|---|---|
| Claude Code | `@anthropic-ai/claude-code` | `node install.cjs` | **Yes**: `bin/claude.exe` is a 500-byte placeholder that the script replaces with the native binary | none | |
| Amp | `@ampcode/cli` | `node install.cjs` | **Yes**: `bin/amp.exe` is a 141-byte placeholder | none | |
| Amp (old name) | `@sourcegraph/amp` | none | | `@ampcode/cli` (`node install.cjs`) | **Yes**. Minimal allow: `--allow-scripts=@ampcode/cli`. CCL CAUT offers only the move to `@ampcode/cli` (manual) |
| OpenCode | `opencode-ai` | `node ./postinstall.mjs` | **Yes**: `bin/opencode.exe` is a 479-byte placeholder | none | |
| OpenCode 2 | `@opencode/cli` | `node ./postinstall.mjs` | **Yes**: `bin/opencode.exe` is a 229-byte placeholder | none | |
| Kimi Code | `@moonshot-ai/kimi-code` | `node scripts/postinstall.mjs` | No: it only renames an old Python `kimi` shim to `kimi-legacy` | `node-pty` (optional) | No (optional terminal feature) |
| Cline | `cline` | `node ./postinstall.mjs \|\| true` | No: `bin/cline` finds the platform binary at runtime; the script only hard-links it for faster startup | `protobufjs` (`node scripts/postinstall`) | No |
| Netlify CLI | `netlify-cli` | `node ./scripts/postinstall.js` | No: shell completion and a welcome message | `esbuild`, `unix-dgram` (optional) | No: esbuild's binary comes from `@esbuild/<platform>` |
| Wrangler | `wrangler` | none | | `esbuild`, `workerd`, `fsevents` (macOS, optional) | No: binaries come from `@esbuild/<platform>` and `@cloudflare/workerd-<platform>`; the scripts are fallbacks |
| Vercel CLI | `vercel` | none | | `esbuild`, `fsevents` (optional) | No |
| Firebase CLI | `firebase-tools` | none | | `protobufjs`, `re2` (optional), `fsevents` (optional) | No (re2 falls back to RegExp) |
| Gemini CLI | `@google/gemini-cli` | none | | `@github/keytar`, `node-pty` (both optional) | No (optional keychain and terminal) |
| Qwen Code | `@qwen-code/qwen-code` | none | | `@qwen-code/audio-capture` (optional) | No (voice input only) |
| Codex CLI | `@openai/codex` | none | | none | |
| Copilot CLI | `@github/copilot` | none | | none | |
| Supabase CLI | `supabase` (manual plan only) | none | | none (the binary comes from `@supabase/cli-<platform>`) | |
| npm | `npm` | none | | none | |

CCL CAUT allows only the four packages marked **Yes** (`NPM_SCRIPT_NEEDED` in `src/utils/npm-scripts.ts`), and only that package, never a wildcard.

## Detection

- **After an update.** If npm's warning names the tool's own package, or the tool's version can't be read and its command doesn't start, CCL CAUT reports the tool as BROKEN with the repair command, never as "unchanged". The repair also goes into Still to do.
- **At scan time.** A tool installed with npm whose command doesn't start (for example the placeholder `claude.exe`) gets a note and a `broken` entry with the repair command in `--json`, `--pending` and Still to do.
- **Canary.** The `npm12` canary job (ubuntu, windows) upgrades npm, installs each npm CLI one version back, runs `ccl-caut --yes`, and checks that every CLI is on its latest version and actually runs.

## Sources

- npm config `allow-scripts`, `ignore-scripts`, `strict-allow-scripts`, `dangerously-allow-all-scripts`: https://docs.npmjs.com/cli/v12/using-npm/config
- `npm install-scripts` (global installs use `--allow-scripts` or `npm config set allow-scripts=... --location=user`): https://docs.npmjs.com/cli/v12/commands/npm-install-scripts
- `npm deny-scripts` (project `package.json` only): https://docs.npmjs.com/cli/v12/commands/npm-deny-scripts
- npm 12.0.0 release, "dependency lifecycle scripts are blocked by default": https://github.com/npm/cli/releases/tag/v12.0.0
- npm 11.16.0 release, Phase 1 of the `allowScripts` policy (the first version with `allow-scripts`): https://github.com/npm/cli/releases/tag/v11.16.0
- RFC npm/rfcs#868 (policy layers and precedence): https://github.com/npm/rfcs/pull/868
- npm/cli#9469, the `--allow-scripts` hint for global installs: https://github.com/npm/cli/pull/9469
