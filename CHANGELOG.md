# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-10

First public release of CCL CAUT, the CLI Agents Update Tool.

### Added

- Scan for Claude Code, Codex CLI, Gemini CLI, Kimi Code, Firebase CLI, Google Cloud CLI and npm, and compare installed with latest versions (npm registry, PyPI, Google Cloud SDK release feed).
- Install-method detection for npm (including nvm, fnm and Volta prefixes), Node-bundled npm, native installers, Homebrew, apt, snap and pip/uv/pipx.
- Shadowed-install detection: every copy of a tool on `PATH` is found, the one that runs is updated, and copies that never run are reported.
- Interactive checklist to pick updates; safe updates run with live output, everything else is shown as a ready-to-copy command with the reason.
- Automatic updates for npm installs in the active prefix and for documented self-updaters (`claude update`, `kimi upgrade`, `gcloud components update` in user-writable SDKs).
- Post-update version re-check; unchanged versions are reported as warnings, Kimi Code staged rollouts as "held".
- Friendly hints for locked files and permission errors; confirmation before updating Claude Code from inside a Claude Code session.
- `--check` (exit 1 when updates are available), `--json`, `--refresh`, `--no-color`, `--version`, `--help`.
- One-hour cache of latest versions in the OS cache folder.

[Unreleased]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/releases/tag/v0.1.0