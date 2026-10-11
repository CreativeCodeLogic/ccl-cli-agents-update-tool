# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `--doctor` now uses the conhost fallback symbols.

## [1.1.0-beta.1] - 2026-10-11

Beta of 1.1.0 (Dev CLIs & more agents): 23 CLIs in two groups. Install it with `npm i -g ccl-caut@next`; `npm i -g ccl-caut@latest` goes back to the stable release.

### Added

- **Groups:** the table and checklist are split into AI agents and Dev CLIs. `--only agents|dev` shows one group for a run; `--hide-group` / `--show-group` keep a group hidden (saved in the config, and the scan line says so). `--discover` and `--json` always cover every group; `--json` adds `group` per tool and `hiddenGroups`.
- **11 new tools.** Dev CLIs: Wrangler, Vercel CLI, Netlify CLI, Supabase CLI and GitHub CLI. AI agents: Aider, Mistral Vibe, Cline CLI, Amp, Kiro CLI and Goose. Every install method and update command was checked against the vendor's docs. Generic binary names (`amp`, `goose`, `vibe`, `cline`) are identified by install location or package metadata before a row is shown; the Amp text editor and pressly/goose count as not installed and are never run.
- **Python tool detection:** uv tool and pipx environments (documented locations, `UV_TOOL_DIR`, `PIPX_HOME`, older pipx homes) and pip installs, with the version read from package metadata. uv and pipx installs update automatically; pip installs get a command (PEP 668). The legacy `kimi-cli` uses it too.
- **Project-copy check:** inside a project whose `package.json` pins a supported CLI, an info note says the global update won't affect it (with the version in `node_modules`); `projectPin` in `--json`. Read-only.
- **Info notes** on rows (dim cyan "i"), such as Cloudflare's advice to install Wrangler per project or a migration hint for the old `@sourcegraph/amp` package. They never change a row's state or preselection; `notes` in `--json`.
- **GitHub token support:** `GITHUB_TOKEN` (or `GH_TOKEN`) raises GitHub's API limit for the tools whose latest version comes from GitHub releases. It is sent only to api.github.com and never printed; `--doctor` shows only whether it is set. GitHub-sourced versions are cached for 6 hours, and on a rate limit the cached version is used with one notice per run.
- **Safe beta publishing:** `prepublishOnly` refuses a prerelease without `--tag next` and a stable version with it. Beta users are told about the higher of the latest beta and the latest stable release; stable users are never pointed at a beta.
- The table compacts step by step to fit narrow terminals (80 columns with every tool installed).
- `--doctor` also checks Kiro's release server and shows the GitHub token status.

### Changed

- **Config downgrade safety:** the config file stays readable by 1.0.x (`schema: 1`, new settings as extra keys), so going back to 1.0.x keeps your remembered selections.

### Fixed

- uv tool environments on Windows are found at the documented `%APPDATA%/uv/data/tools` (the older `%APPDATA%/uv/tools` is still checked).

## [1.0.1] - 2026-10-11

### Fixed

- First run after the machine wakes up no longer shows every tool as "unknown". Latest-version lookups used to open one connection (DNS + TLS) per request all at once and gave up after 2 × 5s on a cold network. Now one warm-up request goes first, lookups share a few keep-alive connections per host, the first attempt gets 8s on a cold start, and the whole check stays under ~15s (the spinner says "slow connection" after 5s).
- A refused proxy tunnel is reported as a proxy problem, not as a timeout.

### Added

- Stale cache as a fallback: when a live lookup fails, an expired cached version is used and marked "cached 9h ago" ("unknown" only without any cached value). `--json`: `latestStaleCachedAt` per tool, `summary.stale`.
- One clear line when most or all lookups fail, naming the reason (timed out, DNS lookup failed, no network connection, proxy refused, certificate problem, HTTP errors), with **r** to retry on the checklist and a Retry/Quit menu when nothing else can be offered. `--json` adds `network` (`attempted`, `failures`, `problem`).
- Proxy support: `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` (upper or lower case) are honored for all lookups.
- `ccl-caut --doctor`: DNS and HTTPS checks with timings for every version server, the proxy settings in use (credentials hidden), and the cache and config paths. The bug report form asks for it.

### Changed

- UI polish: the banner and its subtitle are centered in interactive terminals.

## [1.0.0] - 2026-10-10

First public release of CCL CAUT, the CLI Agents Update Tool, published on npm. Release candidates 1.0.0-rc.1 and rc.2 were tested internally; their changes are folded in below.

### Added

- Twelve supported tools: Claude Code, Codex CLI, GitHub Copilot CLI, Cursor CLI, OpenCode, Gemini CLI, Antigravity CLI, Qwen Code, Kimi Code, Firebase CLI, Google Cloud CLI and npm.
- Install-method detection for npm (including nvm, fnm and Volta prefixes), Node-bundled npm, native installers, Homebrew, apt, snap, pip/uv/pipx, winget, Chocolatey and Scoop. Generic binary names (Cursor's `agent`) are only claimed inside the tool's own install layout, and editor launcher shims are ignored.
- Latest versions from the npm registry, PyPI, GitHub releases and the Google Cloud SDK release feed, cached for one hour (`--refresh` to bypass).
- Shadowed-install detection: every copy of a tool on `PATH` is found, the one that runs is updated, and copies that never run are reported.
- Deprecation notices: retired tools (Gemini CLI for consumer accounts, succeeded by Antigravity CLI) are flagged, never preselected, and can still be updated on request.
- "Updates itself" state for tools that keep themselves current without a public latest version (Cursor CLI), with their own update command offered.
- `--discover`: every supported CLI with a description, installed status and its official install docs (ccl-caut never installs tools); `docsUrl` per tool in `--json`.
- Interactive checklist with remembered per-tool selections (stored in the OS config folder; `--reset-selection` to clear).
- Safe updates: automatic only for npm installs in the active prefix and documented self-updaters (`claude update`, `copilot update`, `agent update`, `opencode upgrade`, `agy update`, `qwen update`, `kimi upgrade` on macOS/Linux, `gcloud components update` in user-writable SDKs); everything else is shown as a ready-to-copy command with the reason.
- Post-update version re-check; unchanged versions are warnings, Kimi Code staged rollouts are reported as "held".
- Friendly hints for locked files and permission errors; Claude Code is never updated from inside a Claude Code session without confirmation.
- Interactive runs start on a clean screen without losing scrollback (`--no-clear` to opt out); long build versions (Cursor's date-hash) are shortened in the table.
- A one-line notice when a newer ccl-caut is available, with the right upgrade command for npx or global installs; background-only, silent offline, off in CI or with `CCL_CAUT_NO_UPDATE_CHECK=1`.
- Flags: `--check` (exit 1 when updates are available), `--json`, `--yes`, `--discover`, `--refresh`, `--reset-selection`, `--no-clear`, `--no-color`, `--version`, `--help`.
- One color system everywhere (table, checklist, progress, summary): green done/up-to-date, amber needs action or selected, cyan updates itself, red retired/failed, dim not selected or secondary. Checklist: amber filled box when selected, dim empty box when not, bold focused row.
- Every prompt accepts `q` to quit ("Nothing was changed.", exit 0) and shows a key footer (`↑/↓ move · space select · a all · enter confirm · q quit`); `a` toggles all. Esc and Ctrl+C still cancel (exit 130).
- Pre-flight "Ready to update?" check: shows which selected CLIs are running (matched by install path, never killed) and which updates need admin rights; Update now / Re-check / Back to selection / Quit. The Claude Code session guard is part of it. `--yes` skips running tools and reports them in the summary.
- Live progress per update: spinner, elapsed time, latest output line and an npm "fetched N files" counter; success collapses to one line, failures print the last 20 lines with a hint.
- "needs admin" tag (table, checklist, `--json` `needsAdmin`), based on write access to where each update goes; no warning and more automatic updates when already elevated. ccl-caut never elevates itself.
- "What next?" menu after updates: Rescan (fresh versions for what was updated) or Quit.
- Manual commands are printed on a clean line of their own (no gutter, no trailing spaces) so selecting and copying gives exactly the command.
- Banner in the solid brand color #53d2ff (24-bit, closest 256-color shade as a fallback, off with NO_COLOR); the demo GIF shows the full flow.
- Demo mode for documentation and recordings, with no real detection, network access, process launches or config writes.

[Unreleased]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.1.0-beta.1...HEAD
[1.1.0-beta.1]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.0.1...v1.1.0-beta.1
[1.0.1]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/releases/tag/v1.0.0