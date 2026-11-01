# Roadmap

> **Plans, not promises.** The AI CLI landscape changes fast: tools get renamed, retired and replaced within weeks. Priorities here shift with it. Day-to-day progress lives in the [milestones](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/milestones).

## What every version keeps

1. **Safe by design.** Updates run automatically only for global npm installs and a tool's own documented updater. Everything else gets the exact command to copy and the reason.
2. **Not an installer.** CCL CAUT never installs a tool. `--discover` links you to each vendor's official install docs.
3. **Never touches your projects.** Only global installs are updated. A project's `node_modules`, `package.json` and lockfile are never changed.
4. **Checked against official docs.** Install methods and update commands come from each vendor's own docs. A weekly canary run catches upstream changes.
5. **Honest results.** Every update is re-checked. You see "updates itself", "retired" or "held" instead of a guess.
6. **No telemetry.**

## Now: 1.2 (stable)

`npx ccl-caut` or `npm i -g ccl-caut`. 23 tools in two groups. AI agents: Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, Gemini (retired), Antigravity, Qwen Code, Kimi Code, Aider, Mistral Vibe, Cline, Amp, Kiro CLI and Goose. Dev CLIs: Firebase, Google Cloud CLI, npm, Wrangler, Vercel CLI, Netlify CLI, Supabase CLI and GitHub CLI. New in 1.2:

- **Live table:** the table appears right away and each row fills in as its check finishes.
- **Update CCL CAUT from the checklist:** a newer CCL CAUT is the first row of the checklist, updated last, verified, then *Run ccl-caut again*.
- **"Still to do"** at the end of every run, and `ccl-caut --pending`: the commands left for you to run, each on a line that copies cleanly.
- **Automatic winget updates** for an allowlist of tools whose silent upgrade was verified (OpenCode, Antigravity CLI, GitHub CLI), per-user installs only, and only once winget has the vendor's version (*waiting for winget* until then).
- **npm 12 and install scripts:** only the script a tool needs to run is allowed (Claude Code, Amp, OpenCode), per tool; `ignore-scripts` is respected; a tool that doesn't start is reported as BROKEN with its repair command.
- **Python version check:** when a new release needs another Python than your uv, pipx or pip install, the update becomes a reinstall command with the right Python.
- **Scheduled runs:** tested recipes for cron, launchd and Task Scheduler ([docs/scheduling.md](docs/scheduling.md)); `--yes` reports skipped tools in its exit code.
- **Narrow windows:** messages, checklist rows and prompts fit the window; the progress area never leaves blank lines.
- **Canary on Linux, macOS and Windows,** with real Python-reinstall, winget-upgrade and npm 12 update checks.

**1.2.x patches** fix what people report.

## Next: 1.3 — What's new

- **`n` shows a tool's release notes, on demand:** in the checklist and on *What next?* (for what was just updated), in a scrollable popup over the screen. Notes are fetched only when you press `n`, never during the scan.
- **Only the latest release's notes,** exactly that version, never older ones, from the vendor's GitHub release or changelog file; tools that publish notes only on a web page get the link (`o` opens it).
- **`--whats-new <tool>`** prints the notes in the terminal, and `--hide-whats-new` / `--show-whats-new` hide or show the key hint (the key keeps working).
- **Polish:**
  - Hide npm's ".npmrc allow-scripts setting is being ignored" warning when CCL CAUT passes your own list along.
  - Leave zero counts out of the summary ("1 updated" instead of "1 updated, 0 manual").
  - Show install-script progress during long updates.

## Later (ideas)

- Hold a tool at its current version until you release it.
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
