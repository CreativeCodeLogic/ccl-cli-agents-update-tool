# Testing CCL CAUT

Thanks for helping test CCL CAUT. It is on npm now (the GitHub repository is still private), so testers install it like any user.

## Install

Requires Node.js 20 or newer.

```bash
npm install -g ccl-caut
ccl-caut --version        # 1.0.0 or newer
```

Or run it once without installing: `npx ccl-caut`. If you installed a release candidate from a `.tgz`, `npm install -g ccl-caut` replaces it (an rc also tells you under its banner that a newer version is available).

Release candidates of future versions, if any, are GitHub **pre-releases** with an npm tarball attached and are not on npm; install one with the [GitHub CLI](https://cli.github.com/):

```bash
gh release download vX.Y.Z-rc.N -R CreativeCodeLogic/ccl-cli-agents-update-tool -p "*.tgz"
npm install -g ./ccl-caut-X.Y.Z-rc.N.tgz
```

To uninstall:

```bash
npm uninstall -g ccl-caut
```

## Testing a beta

Betas are published to npm under the `next` tag; a normal install keeps getting the stable version.

```bash
npm install -g ccl-caut@next      # e.g. 1.1.0-beta.1
ccl-caut --version
npm install -g ccl-caut@latest    # back to the stable release
```

`npx ccl-caut@next` runs a beta once without installing it. Your remembered selections stay compatible both ways. While you are on a beta, the notice under the banner points you to the next beta or to the stable release, whichever is newer.

For 1.1 in particular, please check:

- **Groups:** `ccl-caut --only dev`, `--hide-group dev` / `--show-group dev` (the scan line should say what is hidden).
- **New tools** you have installed (Wrangler, Vercel, Netlify, Supabase, GitHub CLI, Aider, Mistral Vibe, Cline, Amp, Kiro, Goose): right install method, version and update command? Anything with the same name that is *not* that tool (for example the Amp text editor or pressly/goose) must show as not installed.
- **Python tools** installed with uv, pipx or pip.
- **Inside a project** that has one of these CLIs in its `package.json`: you should see an info note, and nothing in the project is changed.
- **GitHub rate limits:** with and without `GITHUB_TOKEN` set (`ccl-caut --doctor` shows whether it is).

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
- the version (`ccl-caut --version`)
- for update problems: the full terminal output of that run