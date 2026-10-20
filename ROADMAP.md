# Roadmap

> **Plans, not promises.** The AI CLI landscape changes fast: tools get renamed, retired and replaced within weeks. Priorities here shift with it. Day-to-day progress lives in the [milestones](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/milestones).

## What every version keeps

1. **Safe by design.** Updates run automatically only for global npm installs and a tool's own documented updater. Everything else gets the exact command to copy and the reason.
2. **Not an installer.** CCL CAUT never installs a tool. `--discover` links you to each vendor's official install docs.
3. **Never touches your projects.** Only global installs are updated. A project's `node_modules`, `package.json` and lockfile are never changed.
4. **Checked against official docs.** Install methods and update commands come from each vendor's own docs. A weekly canary run catches upstream changes.
5. **Honest results.** Every update is re-checked. You see "updates itself", "retired" or "held" instead of a guess.
6. **No telemetry.**

## Now: 1.1 (released)

23 tools in two groups. AI agents: Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, Gemini (retired), Antigravity, Qwen Code, Kimi Code, Aider, Mistral Vibe, Cline, Amp, Kiro CLI and Goose. Dev CLIs: Firebase, Google Cloud CLI, npm, Wrangler, Vercel CLI, Netlify CLI, Supabase CLI and GitHub CLI. Run it with `npx ccl-caut` or `npm i -g ccl-caut`.

Dev CLIs and more agents shipped together in 1.1 (the agents planned for 1.2 shipped early, in 1.1; Polish is now 1.2):

- **Two groups in the table:** AI agents and Dev CLIs. Firebase, the Google Cloud CLI and npm move to Dev CLIs, and you can hide a group you don't need.
- **New Dev CLIs:** Wrangler, Vercel CLI, Netlify CLI, Supabase CLI and GitHub CLI.
- **Project-copy check:** when you run CCL CAUT inside a project that pins its own copy of a tool (for example `wrangler` in `devDependencies`), it tells you the global update won't affect that project.
- **Per-project notes:** tools whose vendors recommend installing them per project say so on their row.
- **Python tool detection** for tools installed with uv, pipx or pip.
- **New agents:** Aider, Mistral Vibe, Cline, Amp, Kiro CLI and Goose.
- **Beta channel:** try upcoming versions early with `npx ccl-caut@next`.

**1.1.x patches** focus on confirming every automatic update path on real Windows, macOS and Linux machines, and on fixing what people report.

## Next: 1.2 — Polish

- A table that fills in live, row by row, as each check finishes.
- Update CCL CAUT itself from the checklist.
- Ready-made recipes for scheduled runs (cron, launchd, Task Scheduler) with `--check` or `--yes`.
- winget updates run automatically where a vendor's unattended upgrade has been shown to work reliably.
- The canary run also on macOS and Windows.

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
