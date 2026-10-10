# Testing release candidates

Thanks for helping test CCL CAUT before its public release. Release candidates are published as GitHub **pre-releases** with an npm tarball attached; they are not on npm.

## Install a release candidate

Requires Node.js 20+ and the [GitHub CLI](https://cli.github.com/) signed in with access to the repository.

```bash
gh release download v1.0.0-rc.2 -R CreativeCodeLogic/ccl-cli-agents-update-tool -p "*.tgz"
npm install -g ./ccl-caut-1.0.0-rc.2.tgz
ccl-caut --version        # 1.0.0-rc.2
```

Use the newest pre-release from the [releases page](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/releases) and adjust the version in the commands.

To uninstall:

```bash
npm uninstall -g ccl-caut
```

## What to test

First, note what you have: which of the 12 CLIs are installed and how (npm, Homebrew, winget, an install script, apt, ...). `ccl-caut --discover` lists them all.

- **Interactive run:** `ccl-caut`. Banner, table, notes, checklist, updates and the summary. Does the screen clear without losing your scrollback?
- **`ccl-caut --check`** and **`ccl-caut --json`**: is every installed tool detected with the right version, install method ("Via") and latest version?
- **`ccl-caut --discover`**: correct installed status and working links.
- **Remembered selections:** untick something, confirm, run again; the hint appears and your choice is kept. `--reset-selection` clears it.
- **Keys and quitting:** `↑/↓`, `space`, `a` (all), `enter`, and `q` on every prompt ("Nothing was changed.", exit code 0). Are the colors consistent (amber = selected/needs action, dim = not selected)?
- **Pre-flight:** open a session of a CLI you want to update (for example `codex`), then run ccl-caut and select it. Is it listed as running? Close it and pick *Re-check*. Does anything unrelated show up as running?
- **needs admin:** are the right updates tagged (for example a Google Cloud SDK under Program Files, or a root-owned npm prefix)? Run once from an elevated terminal (Windows: *Run as administrator*; macOS/Linux: not needed unless you normally use sudo) and check the tag disappears.
- **Progress:** during an update, do you see a spinner, the elapsed time and the latest output line? After it, one result line; on a failure, the last lines of output and a hint.
- **Manual commands:** select and copy a printed command in your terminal. Do you get exactly the command, with no extra characters or spaces?
- **What next?:** after updates, *Rescan* runs the check again with fresh versions.
- **`ccl-caut --yes`**: updates exactly what would be preselected, without prompts, and skips tools that are running.
- **Real updates, most important:** the paths in the [1.0.x milestone](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/milestone/1), for example `claude update` (native install), `copilot update`, `opencode upgrade`, `qwen update`, `agy update`, `kimi upgrade` on macOS/Linux and `gcloud components update` in a user-writable SDK. After an update, ccl-caut re-checks the version: report any wrong command, a "success" that didn't actually update, or a warning that looks wrong.

Inside a Claude Code session, the pre-flight check offers to skip Claude Code (the default); test updating Claude Code from a normal terminal too.

## How to report

Open a [bug report](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/issues/new/choose) (or comment on the matching 1.0.x issue) and include:

- `ccl-caut --json` output (**redact your username** in binary paths, e.g. `C:\Users\you\...` or `/home/you/...`)
- OS and version, terminal (Windows Terminal, VS Code, iTerm2, ...), `node --version`
- the release candidate version (`ccl-caut --version`)
- for update problems: the full terminal output of that run