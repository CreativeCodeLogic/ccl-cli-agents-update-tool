# Roadmap

> **Plans, not promises.** The AI CLI landscape changes fast: tools get renamed, retired and replaced within weeks. Priorities here shift with it. Day-to-day progress lives in the [milestones](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/milestones).

## What every version keeps

1. **Safe by design.** Updates run automatically only for global npm installs and a tool's own documented updater. Everything else gets the exact command to copy and the reason.
2. **Not an installer.** CCL CAUT never installs a tool. `--discover` links you to each vendor's official install docs.
3. **Never touches your projects.** Only global installs are updated. A project's `node_modules`, `package.json` and lockfile are never changed.
4. **Checked against official docs.** Install methods and update commands come from each vendor's own docs. A weekly canary run catches upstream changes.
5. **Honest results.** Every update is re-checked. You see "updates itself", "retired" or "held" instead of a guess.
6. **No telemetry.**

## Now: 1.3 (stable)

`npx ccl-caut` or `npm i -g ccl-caut`. 23 tools in two groups. AI agents: Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, Gemini (retired), Antigravity, Qwen Code, Kimi Code, Aider, Mistral Vibe, Cline, Amp, Kiro CLI and Goose. Dev CLIs: Firebase, Google Cloud CLI, npm, Wrangler, Vercel CLI, Netlify CLI, Supabase CLI and GitHub CLI. New in 1.3 "What's new":

- **`n` shows a tool's release notes, on demand:** in the checklist and on *What next?* (for what was just updated), in a scrollable panel over the screen. Notes are fetched only when you press `n`, never during the scan.
- **Only the latest release's notes,** exactly that version, never older ones, from the vendor's GitHub release or changelog file; tools that publish notes only on a web page get the link (`o` opens it).
- **`--whats-new <tool>`** prints the notes in the terminal, and `--hide-whats-new` / `--show-whats-new` hide or show the key hint (the key keeps working).
- **A second try on a cold network:** when most lookups fail, CCL CAUT retries the failed ones once before it warns.
- **Symbols without emoji:** green ✓ ticks and □/■ boxes in Windows Terminal.
- **Polish:** install-script progress during long npm updates, no zero counts in the summary, no expected npm warning as the progress line.

Still in 1.3, from 1.2: the live table, CCL CAUT updating itself from the checklist, *Still to do* and `--pending`, automatic winget updates, npm 12 install-script handling, the Python version check, scheduled runs, and the canary on Linux, macOS and Windows.

**1.3.x patches** fix what people report.

## Next: candidates

Ideas under consideration for after 1.3, not promises:

- **The "earlier changes" link in the What's new footer** is cut off in narrow panels; it should end with "…" or say "press o".
- **`--doctor` checks the release-notes hosts** too (`raw.githubusercontent.com` and `dl.google.com` for notes).
- **Amp shows "update available" on almost every run,** because it publishes a new build every 1–4 hours.

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
