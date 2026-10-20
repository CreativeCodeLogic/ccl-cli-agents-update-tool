# Roadmap

> **Plans, not promises.** The AI CLI landscape changes fast: tools get renamed, retired and replaced within weeks. Priorities here shift with it. Day-to-day progress lives in the [milestones](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/milestones).

## What every version keeps

1. **Safe by design.** Updates run automatically only for global npm installs and a tool's own documented updater. Everything else gets the exact command to copy and the reason.
2. **Not an installer.** CCL CAUT never installs a tool. `--discover` links you to each vendor's official install docs.
3. **Never touches your projects.** Only global installs are updated. A project's `node_modules`, `package.json` and lockfile are never changed.
4. **Checked against official docs.** Install methods and update commands come from each vendor's own docs. A weekly canary run catches upstream changes.
5. **Honest results.** Every update is re-checked. You see "updates itself", "retired" or "held" instead of a guess.
6. **No telemetry.**

## In beta: 1.2 — Polish

`npm i -g ccl-caut@next` (back to stable: `npm i -g ccl-caut@latest`). It becomes stable once it meets the bar under "Release channels" below.

- **Live table:** the table appears right away and each row fills in as its check finishes.
- **Update CCL CAUT from the checklist:** a newer CCL CAUT is the first row of the checklist, updated last, verified, then *Run ccl-caut again*.
- **Automatic winget updates** for an allowlist of tools whose silent upgrade was verified (OpenCode, Antigravity CLI, GitHub CLI), per-user installs only, and only once winget has the vendor's version (*waiting for winget* until then).
- **Python version check:** when a new release needs another Python than your uv, pipx or pip install, the update becomes a reinstall command with the right Python instead of an update that silently does nothing.
- **Scheduled runs:** tested recipes for cron, launchd and Task Scheduler ([docs/scheduling.md](docs/scheduling.md)); unattended runs never wait for input, and `--yes` reports skipped tools in its exit code.
- **Quieter:** the `--discover` hint disappears once you've used it.
- **Canary on Linux, macOS and Windows,** plus real Python-reinstall and winget-upgrade checks.

## Now: 1.1 (stable)

23 tools in two groups. AI agents: Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, Gemini (retired), Antigravity, Qwen Code, Kimi Code, Aider, Mistral Vibe, Cline, Amp, Kiro CLI and Goose. Dev CLIs: Firebase, Google Cloud CLI, npm, Wrangler, Vercel CLI, Netlify CLI, Supabase CLI and GitHub CLI, with Python tool detection, project-copy notes and the beta channel. Run it with `npx ccl-caut` or `npm i -g ccl-caut`. **1.1.x patches** fix what people report until 1.2 is stable.

## Later (ideas)

- Hold a tool at its current version until you release it.
- A "what's new" link next to each update.
- Standalone binaries for people who don't have Node.js.
- CCL CAUT through Homebrew, Scoop and winget.
- Hide individual tools from the table.

## Not planned

These are deliberate choices, not gaps:

- **Installing tools**, or running `curl … | bash` / `irm … | iex` scripts for you. Installing is your call, using the vendor's instructions.
- **Changing project dependencies**, lockfiles or `node_modules`.
- **Telemetry** or usage tracking of any kind.
- **A full-screen interface that disappears on exit.** The summary and the commands to copy stay in your terminal.

## Release channels

| Channel | How to run it | What it is |
| --- | --- | --- |
| Stable | `npx ccl-caut` | Released versions |
| Beta | `npx ccl-caut@next` | Upcoming versions, before they become stable |
| Source | clone `main`, then `npm ci && npm run build` | Latest development work |

A beta becomes stable once it passes the full CI matrix and the canary run, has been tested on real Windows, macOS and Linux machines, and has spent at least a week in beta with no reports of a wrong command or a false success.

## Suggest something

- **Want a CLI supported?** Open a [CLI support request](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/issues/new/choose) with a link to its official install docs.
- **Found a bug?** Open a [bug report](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/issues/new/choose) and include `ccl-caut --json` output (please redact usernames in paths).
