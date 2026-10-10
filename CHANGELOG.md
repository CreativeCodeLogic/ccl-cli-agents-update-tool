# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-10

First public release of CCL CAUT, the CLI Agents Update Tool.

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
- Demo mode for documentation and recordings, with no real detection, network access, process launches or config writes.

[Unreleased]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/releases/tag/v1.0.0