# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0-beta.5] - 2026-10-29

Fifth beta of 1.2: `npm i -g ccl-caut@next`.

### Fixed

- **Checklist rows wrapped in narrow windows** (e.g. Windows Terminal at half the screen). A row like "Google Cloud CLI  590.0.1 → 591.0.0  manual: command will be shown · needs admin" could be wider than the window, so "needs admin" wrapped to column 0 without the `│` gutter (beta.4 fixed this for notes, not for prompt rows).
  - Every checklist row now fits on one line: the name and versions always stay, and the hint gives way to fit, counting characters by display width (CJK and emoji count double).
  - The hint shortens in this order, least important first: (1) short forms "auto", "manual" and "updates itself"; (2) then those parts are dropped; (3) then "retired, opt-in" becomes "retired" and is dropped; (4) "needs admin" stays longest, then becomes "admin" and is finally cut with "…". It outranks the rest because without an elevated terminal that update fails.
- **Other prompt lines also stay inside the window:**
  - The collapsed "Select the CLIs to update" answer lists as many names as fit, then "+N more".
  - Picker rows (pre-flight, *What next?*) are cut with "…".
  - Long questions, hints and the key line wrap under the gutter.
  - The header drops " — by Creative Code Logic" (then the tagline) when narrow, and the scan line drops the `--discover` hint rather than wrapping.
  - Commands to copy still stay on one line.

## [1.2.0-beta.4] - 2026-10-28

Fourth beta of 1.2: `npm i -g ccl-caut@next`.

### Fixed

- **npm 12 left some CLIs broken after an update.** npm 12 skips install scripts it wasn't told to allow, also for `npm install -g`, and still exits 0. Claude Code, Amp and OpenCode ship a placeholder binary that their own install script replaces, so updating them left a command that doesn't start ("claude.exe … is not a valid application for this OS platform").
  - CCL CAUT now adds `--allow-scripts=<that package>` for those packages only, on npm 11.16.0 and later (older npm doesn't know the flag). The flag replaces the `allow-scripts` list in your `.npmrc` for that install, so your own entries are passed along with it.
  - If you turned install scripts off (`ignore-scripts=true`), CCL CAUT doesn't override that. It gives you the command that allows the script once, and says why.
  - After an npm update, a tool whose own script npm skipped, or that no longer starts, is reported as **BROKEN** with the repair command (also under *Still to do*), never as "unchanged". At scan time, a tool installed with npm whose command doesn't start gets a note and the repair command (`broken` in `--json`, `--pending` and *Still to do*).
  - Per-tool findings and sources: [docs/npm-install-scripts.md](docs/npm-install-scripts.md). A new weekly canary job updates every npm CLI on the latest npm on Linux and Windows and checks that each one runs.
- **Long messages broke at narrow widths** (e.g. Windows Terminal at half the screen, ~95 columns). Deprecation and retirement notices, pre-flight warnings, manual-plan reasons and project notes were printed as one long line. The terminal then cut them mid-word, and the continuation lost the `│` gutter ("Antigravity C" / "LI (agy)").
  - These messages are now word-wrapped to the window: CJK and emoji count double, continuation lines keep the gutter, and URLs and commands aren't split.
  - Commands you copy (*run this yourself*, *Still to do*) stay on one line.
  - The table cuts its widest cells instead of letting a row wrap.
- **Blank `│` lines filled the screen during long updates, with the progress line floating among them.** The live status erased its previous frame by moving the cursor up one row per line, but a status line wider than the window takes two rows. Every redraw (10 a second) left a `│` behind. Now:
  - The status area is always three rows, each cut to the window by display width, and the title shortens first so the time and counter stay readable.
  - Each redraw erases exactly the rows the last frame took, recounted after a resize.
  - Output redrawn with `\r` (progress bars, spinners) counts once, in its final state, and lines that are blank once escape codes are stripped are dropped.
- **The terminal title stayed "npm install netlify-cli@latest" (or "node-gyp") after an update on Windows.** The commands CCL CAUT runs share its console and rename it. CCL CAUT now puts the title back after every command and on exit. Windows doesn't let Node read the console title, so it reads "ccl-caut" while running and is cleared at the end (cmd.exe then shows its own title again). Only in a terminal; macOS and Linux weren't affected.

## [1.2.0-beta.3] - 2026-10-23

Third beta of 1.2: `npm i -g ccl-caut@next`.

### Added

- **"Still to do" at the end of every run:** when a run ends (`q` at the checklist or at *What next?*, after updates, after a self-update, in `--yes` and scheduled runs), the last lines list the commands you still have to run yourself: ticked tools whose update is a command to copy (Python reinstalls included), and automatic updates that failed or were skipped (running, needs admin rights), with their command. Each command is a plain line (no symbol, indent or color) under a `#` comment with its context, so a triple-click copies exactly the command, and pasting both lines works in bash, zsh and PowerShell. Nothing is printed when there's nothing left, after Ctrl+C, or for unticked, up-to-date or *waiting for winget* tools. In `--demo` the demo notice stays the very last block.
- **`ccl-caut --pending`:** rescans and prints only that list, for the tools that would be selected (remembered choices, else the defaults; `--only` and hidden groups apply). Exit code 1 while something is left, 0 when not. `--pending --json` prints the list as JSON; `--json` includes it as `pending` (`id`, `name`, `command`, `reason`, `needsAdmin`, `shell`).
## [1.2.0-beta.2] - 2026-10-21

Second beta of 1.2, with fixes from team testing: `npm i -g ccl-caut@next`.

### Changed

- **Demo mode is impossible to miss:** `--demo` shows "DEMO MODE: sample data only. Nothing on this computer is installed, updated or changed. Tool names and versions are made up for the demo." under the header, at the very end, and at the top and bottom of every prompt (checklist, pre-flight, What next?), as an amber reversed bar between lines of `=` (plain ASCII in classic consoles and with `--no-color`). Every demo update is labelled "(simulated)". `--demo --json` has a top-level `"demo": true`.
- **"What next?" takes `r` to rescan:** the footer reads `↑/↓ move · enter confirm · r rescan · q quit`; `r` does exactly what *Rescan* does. After CCL CAUT has updated itself there is no rescan (the old code is still running), so only `q`.
- After *Re-check*, the pre-flight no longer repeats "Ready to update?": it says what it found, for example "Checked again: Codex CLI is still running. Update anyway?". "Ready to update?" is asked once per update round.

### Fixed

- **"Ready to update?" appeared twice, and the first key at the pre-flight was lost** (1.2.0-beta.1, live table). When the live table finished, it switched the console out of raw mode, which clack's spinner had left on (on Windows). The next prompt then dropped its first keys and left a stale copy of the question on screen, so pressing Enter seemed to do nothing and the question showed up twice. The live table now restores stdin exactly as it found it. Separately, pressing Enter on the preselected *Re-check* (preselected while a selected tool is running) used to ask the identical question again; see **Changed**.

## [1.2.0-beta.1] - 2026-10-20

First beta of 1.2 "Polish": `npm i -g ccl-caut@next` (back to stable: `npm i -g ccl-caut@latest`). Note the changed `--yes` exit code under **Changed**.

### Added

- **Live table:** in a terminal the table appears right away and each row fills in as its latest-version check finishes (*checking…* until then), instead of a spinner followed by the whole table. It redraws in place (no full-screen mode, at most 10 frames a second), and the finished table stays in your scrollback exactly as 1.1 printed it. `q` stops during the check (exit 0), Ctrl+C or Esc cancel (130). Piped output, CI, `TERM=dumb`, a window too short for the table or a resize during the check fall back to the spinner; `CCL_CAUT_NO_LIVE=1` turns it off.
- **Update CCL CAUT from the checklist:** a global npm install gets the newer ccl-caut as its own first row, **CCL CAUT** (preselected, remembered, applied by `--yes`; beta users are offered the higher of `next` and `latest`, stable users only `latest`). It installs the exact version last, after every other update, checks `ccl-caut --version`, then offers only Quit: *CCL CAUT updated to X. Run ccl-caut again to use it.* Other prefixes (nvm, fnm, Volta) get the command; npx and source checkouts get no row. If Windows keeps the files busy, the message says so and gives the command. Tested end to end in CI on Linux, macOS and Windows.
- **Automatic winget updates for an allowlist:** OpenCode, Antigravity CLI and GitHub CLI installed per-user with winget update automatically (`winget upgrade --id <Id> --exact --source winget --scope user --silent --accept-source-agreements --accept-package-agreements --disable-interactivity`), each verified with a real silent upgrade from an older version on a Windows runner and checked weekly by the canary. Machine-wide installs stay a command (they need elevation). When winget doesn't have the vendor's latest version yet, the row says *waiting for winget* and nothing is attempted; winget's "no applicable update" answer counts the same way, never as a failure. GitHub Copilot CLI stays a command: winget couldn't match its own per-user install during the upgrade test.
- **Python version check for uv, pipx and pip installs:** when the latest release needs another Python than your install uses (Mistral Vibe 3.0 needs Python 3.14+), the row still says *update available*, a note explains it, and the update becomes a command that reinstalls it with a fitting Python (`uv tool upgrade --python 3.14 mistral-vibe`, `pipx reinstall --python 3.14 mistral-vibe`, or a pip command). It is never preselected, so `--yes` no longer reports it as "unchanged" on every run. Only when both versions are known. `--json`: `compatibility` per tool.
- **Recipes for scheduled runs:** [docs/scheduling.md](docs/scheduling.md) shows how to run `ccl-caut --check` (notify only) or `--yes` (update) weekly from cron, launchd and Task Scheduler as your normal user, with absolute paths (including nvm, fnm and Volta), a log file and the exit codes. CI runs the cron and launchd recipes for real; the Task Scheduler recipes were run on a real Windows machine.
- `--help` lists `CCL_CAUT_NO_LIVE`, `GITHUB_TOKEN`/`GH_TOKEN` and `FORCE_COLOR`; `--doctor` names the winget version lookups.

### Changed

- **`--yes` now exits with 1 when a selected tool was skipped** (it is running, needs admin rights, or is Claude Code inside a Claude Code session). In 1.1 it exited with 0. Scripts that treated `--yes` as "always 0" should check for 1: like a failed update, a skipped one did not apply, and a scheduled run's log and exit code now show it.
- `--yes` skips automatic updates that need admin rights (they would fail; ccl-caut never elevates), with the reason.
- Unattended runs never wait for input: without a terminal, update commands get no stdin, so a prompt sees end-of-input instead of hanging.
- The scan line stops suggesting `ccl-caut --discover` once you have run it (remembered in the config as an extra key, so 1.0.x and 1.1.x still read the file; `--reset-selection` keeps it).
- The canary run (real installs of the npm, uv and pipx CLIs) runs on macOS and Windows as well as Linux, plus a Python-reinstall and a winget-upgrade check.

### Fixed

- On Windows, output redirected to a file or a scheduler log contained color escape codes; output that doesn't go to a terminal is now plain text on every OS (`FORCE_COLOR=1` keeps colors, CI logs keep them).
- In classic Windows consoles, the line above the table used a Unicode bar between ASCII ones.

## [1.1.0] - 2026-10-13

CCL CAUT 1.1 (Dev CLIs & more agents): 23 CLIs in two groups, Python tool detection and notes for tools that live in your projects. Update with `npm i -g ccl-caut` or run `npx ccl-caut`. This release is identical to 1.1.0-beta.2; the [CHANGELOG](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/blob/main/CHANGELOG.md) sections for 1.1.0-beta.1 and 1.1.0-beta.2 list every change in detail. Published from GitHub Actions with npm provenance and approved by a maintainer.

### Added

- **11 more CLIs, 23 in total.** Dev CLIs: Wrangler, Vercel CLI, Netlify CLI, Supabase CLI and GitHub CLI. AI agents: Aider, Mistral Vibe, Cline CLI, Amp, Kiro CLI and Goose. Install methods and update commands are checked against each vendor's docs, and generic binary names (`amp`, `goose`, `vibe`, `cline`) are only claimed where that tool installs itself (the Amp text editor and pressly/goose are left alone and never run).
- **Two groups, AI agents and Dev CLIs.** `--only agents|dev` shows one group for a run; `--hide-group` / `--show-group` keep a group hidden. `--discover` and `--json` always cover everything.
- **Python tools:** CLIs installed with uv tool, pipx or pip are detected; uv and pipx installs update automatically, pip installs get the command to run.
- **Project-copy check and info notes:** inside a project that pins a supported CLI in `package.json`, a note says the global update won't affect it; vendor advice (such as installing Wrangler per project) appears as a dim note on the row. Read-only, and never changes what is selected.
- **`--json` in a terminal** offers Copy to clipboard, Save to file or Browse… after the JSON; `--output <file>` (with `--force` to overwrite) writes it without a prompt. Pipes, CI and `--yes` get exactly the JSON as before.
- **`GITHUB_TOKEN` / `GH_TOKEN`** raise GitHub's API limit for tools whose latest version comes from GitHub releases (sent only to api.github.com, never printed). Those versions are cached for 6 hours, and on a rate limit the cached version is used with one notice.
- `--doctor` checks Kiro's release server and shows whether a GitHub token is set.
- The table compacts step by step to fit narrow terminals.
- A link to the GitHub repository in the `--help` footer and in unexpected-error reports, and once per version a dim "Star it on GitHub" line at the end of an interactive run (never with `--json`, `--check`, `--yes`, piped output or CI).

### Changed

- The big banner shows only on the default interactive run; option paths start with one compact line, and `--json`, `--version`, piped output and CI print no header.
- Your config stays readable by 1.0.x, so going back keeps your remembered selections.
- The update notice for beta users points to the higher of the next beta and the stable release; stable users are never pointed at a beta.
- The npm package is about 58 kB instead of 1.3 MB, and releases now carry npm provenance.

### Fixed

- Large output piped from ccl-caut (for example `ccl-caut --json | jq` on macOS) was cut off at 8 KB.
- uv tool environments on Windows are found at the documented location.
- `--doctor` uses the fallback symbols in classic Windows consoles.

## [1.1.0-beta.2] - 2026-10-12

Second beta of 1.1.0: `npm i -g ccl-caut@next`. The first release staged from GitHub Actions (npm staged publishing, with provenance) and approved by a maintainer.

### Added

- `--json` in a terminal: after the JSON, **Copy to clipboard** (Windows Set-Clipboard, macOS pbcopy, Linux wl-copy/xclip/xsel), **Save to file** (prefilled `./ccl-caut-report-YYYY-MM-DD.json`, confirms before overwriting) or, where a native dialog works and not over SSH, **Browse…**. Pipes, CI and `--yes` get exactly the JSON as before. Simulated in `--demo`.
- `--output <file>` (with `--json`): writes the JSON to a file without a prompt and prints the path to stderr; refuses to overwrite unless `--force`.
- The GitHub link, used sparingly: a `--help` footer (docs & issues, and Creative Code Logic), a request to report unexpected internal errors with `ccl-caut --doctor` output, and once per version a dim "Star it on GitHub" line at the end of a normal interactive run (never with `--json`, `--check`, `--yes`, piped output, CI or the demo; remembered in the config as an extra key 1.0.x ignores). URLs are clickable (OSC 8) in terminals that support it and plain text elsewhere, including classic conhost.

### Changed

- Header policy: the big banner only on the default interactive run; every option path (`--check`, `--discover`, `--doctor`, `--help`, `--only`, `--hide-group`, `--show-group`, `--reset-selection`, `--yes`) starts with one compact line, "CCL CAUT v<version> · CLI Agents Update Tool — by Creative Code Logic"; `--json`, `--version`, piped output and CI print no header.
- The npm package is much smaller (about 58 kB instead of 1.3 MB): it no longer ships the demo GIF, and its README is the repository README (the GIF loads from GitHub).

### Fixed

- `--doctor` now uses the conhost fallback symbols.
- Large output piped from ccl-caut (for example `ccl-caut --json | jq` on macOS) was cut off at 8 KB; ccl-caut now waits for its output to be written before exiting.

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

[Unreleased]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.2.0-beta.5...HEAD
[1.2.0-beta.5]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.2.0-beta.4...v1.2.0-beta.5
[1.2.0-beta.4]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.2.0-beta.3...v1.2.0-beta.4
[1.2.0-beta.3]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.2.0-beta.2...v1.2.0-beta.3
[1.2.0-beta.2]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.2.0-beta.1...v1.2.0-beta.2
[1.2.0-beta.1]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.1.0...v1.2.0-beta.1
[1.1.0]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.0.1...v1.1.0
[1.1.0-beta.2]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.1.0-beta.1...v1.1.0-beta.2
[1.1.0-beta.1]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.0.1...v1.1.0-beta.1
[1.0.1]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/releases/tag/v1.0.0