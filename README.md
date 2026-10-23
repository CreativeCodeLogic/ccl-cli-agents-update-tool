# CCL CAUT

**One command to check and update every AI coding CLI on your machine.**

Twenty-three CLIs. Twelve ways to install them. One checklist.

[![CI](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/actions/workflows/ci.yml/badge.svg)](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ccl-caut.svg)](https://www.npmjs.com/package/ccl-caut)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](package.json)

CCL CAUT (**C**LI **A**gents **U**pdate **T**ool) finds the AI and developer CLIs you have installed, compares what you run with what's released, and lets you pick what to update from a single checklist. It supports 23 tools. AI agents: Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, Gemini, Antigravity, Qwen Code, Kimi Code, Aider, Mistral Vibe, Cline, Amp, Kiro and Goose. Dev CLIs: Firebase, the Google Cloud CLI, npm, Wrangler, Vercel, Netlify, Supabase and the GitHub CLI.

![CCL CAUT demo: scan, the live table filling in, notes, the checklist with CCL CAUT itself on top, and updates](https://raw.githubusercontent.com/CreativeCodeLogic/ccl-cli-agents-update-tool/36859c5f799db8f082e84e104c1f937f7e39ad71/docs/demo.gif)

<sub>Recorded with `ccl-caut --demo` (sample data, nothing real is updated; the demo says so on every screen) using [VHS](https://github.com/charmbracelet/vhs); see [`docs/demo.tape`](docs/demo.tape).</sub>

## Quick start

```bash
npx ccl-caut            # run once, no install
```

```bash
npm install -g ccl-caut  # or keep it around
ccl-caut
```

Try upcoming versions (betas, when there is one): `npm i -g ccl-caut@next`. Back to stable: `npm i -g ccl-caut@latest`.

From source:

```bash
git clone https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool.git
cd ccl-cli-agents-update-tool
npm ci && npm run build
node dist/index.js
```

Requires Node.js 20 or newer to run; building from source needs Node 22.18 or newer.

## What it looks like

```text
◇  Found 10 of 23 supported CLIs · ccl-caut --discover to see all
     Tool              Installed   Latest   State             Via
  ────────────────────────────────────────────────────────────────────────────
  AI agents
  ✔  Claude Code       2.1.296     2.1.296  up-to-date        native
  ↑  Codex CLI         0.161.0     0.162.1  update available  npm
  ↻  Cursor CLI        2026.10.01  —        updates itself    native
  ⊘  Gemini CLI        0.62.1      0.63.0   retired           npm
  ↑  Kimi Code         2.0.4       2.1.1    update available  native +1 hidden
  ↑  Aider             0.86.1      0.86.2   update available  uv
  Dev CLIs
  ↑  Google Cloud CLI  587.0.0     588.0.0  update available  apt needs admin
  ✔  npm               12.2.0      12.2.0   up-to-date        node
  ✔  Wrangler          4.149.0     4.149.0  up-to-date        npm
  ↑  Netlify CLI       27.11.0     27.12.0  update available  npm
▲  gemini: retired for consumer accounts since Jun 2026 -> use Antigravity CLI (agy).
   Still works with enterprise licenses / paid API keys.
▲  kimi: native 2.0.4 runs; npm 2.1.1 is installed but shadowed on PATH
i  wrangler: Cloudflare recommends installing Wrangler per project (npm i -D wrangler).
   https://developers.cloudflare.com/workers/wrangler/install-and-update/
i  wrangler: This project pins wrangler ^4.149.0 (devDependencies; 4.148.0 in node_modules).
   Updating the global copy won't affect it; use `npx wrangler` here.
   needs admin = the command needs sudo
```

Then pick what to update: `↑/↓` move, `space` selects, `a` toggles all, `enter` confirms and `q` quits from any prompt without changing anything. Colors mean the same thing everywhere: green is done or up-to-date, amber needs action (selected, update available, needs admin), cyan updates itself, red is retired or failed, dim is not selected or secondary.

The table appears as soon as your installed CLIs are found, and each row fills in as its latest-version check finishes (*checking…* until then); `q` stops, Ctrl+C or Esc cancel. Once everything is checked, the finished table stays in your scrollback, with no spinner frames or half-drawn rows left behind. Piped output, CI, `TERM=dumb`, `CCL_CAUT_NO_LIVE=1`, a window too short for the table, or resizing it during the check get a plain spinner and then the table.

When a newer CCL CAUT is out and you installed it globally with npm, it is the first row of the checklist, **CCL CAUT** (see [Updating CCL CAUT itself](#updating-ccl-caut-itself)).

Before anything runs, a short **pre-flight** check shows which selected CLIs are running right now (close agent sessions and the IDEs or terminals that use them first) and which updates need administrator rights. Choose *Update now*, *Re-check*, *Back to selection* or *Quit*. Each update shows a spinner, the elapsed time and the latest output line, then collapses to `Codex CLI 0.161.0 → 0.162.1`; the full log is printed only when something fails (or with `CCL_CAUT_DEBUG=1`). Commands CCL CAUT can't run safely are printed on a line of their own, ready to select and copy. Afterwards, *Rescan* (or `r`) runs the whole check again with fresh versions, or *Quit* (`q`). After CCL CAUT has updated itself only *Quit* is offered: run it again to use the new version.

### Still to do

Whenever a run ends (`q` at the checklist or at *What next?*, after updates, after a self-update, and in `--yes` and scheduled runs), the last thing printed is what you still have to run yourself: the tools you ticked whose update is a command to copy, plus automatic updates that failed or were skipped (running, needs admin rights), with their command. Unticked tools, *waiting for winget* and up-to-date tools aren't listed, and nothing is printed when there's nothing to do (or after Ctrl+C):

```text
Still to do, run these yourself:

# Google Cloud CLI (admin terminal)
sudo apt-get update && sudo apt-get install --only-upgrade google-cloud-cli

# Kimi Code (PowerShell)
irm https://code.kimi.com/kimi-code/install.ps1 | iex

Run ccl-caut --pending anytime to see what's left.
```

Each command is a line of its own, with no symbol, indent or color, so a triple-click copies exactly the command. Its context is a `#` comment on the line above: bash, zsh and PowerShell ignore it if you paste both lines (cmd.exe just says `'#' is not recognized` and runs the next line).

`ccl-caut --pending` rescans (latest versions from the cache unless `--refresh`) and prints only that list, for the tools that would be selected (your remembered choices, else the defaults; `--only` and hidden groups apply). It exits with 1 when something is left and 0 when not, so once you've run a command it drops off the list. `--pending --json` prints the list as JSON, and `--json` includes it as `pending` (`id`, `name`, `command`, `reason`, `needsAdmin`, `shell`: `powershell`, `sh` or `any`).

## Supported tools

### AI agents

| Tool | Install methods detected | How it is updated |
| --- | --- | --- |
| Claude Code | npm, native installer, Homebrew | npm: **auto** · native: **auto** (`claude update`) · Homebrew: command |
| Codex CLI | npm, Homebrew, standalone binary | npm: **auto** · others: command |
| GitHub Copilot CLI | npm, install script, Homebrew, winget | npm: **auto** · script: **auto** (`copilot update`) · Homebrew, winget: command |
| Cursor CLI (`agent`) | installer, Homebrew | installer: **updates itself** (`agent update` offered) · Homebrew: command |
| OpenCode | npm (v1 and v2), install script, Homebrew, Chocolatey, Scoop, winget | npm: **auto** · script: **auto** (`opencode upgrade`) · winget: **auto** (per-user installs) · others: command |
| Gemini CLI | npm, Homebrew | **retired** for consumer accounts (see below) · npm: **auto** if you tick it · Homebrew: command |
| Antigravity CLI (`agy`) | install script, Homebrew, winget | script: **auto** (`agy update`) · winget: **auto** (per-user installs) · Homebrew: command |
| Qwen Code | npm, standalone installer, Homebrew | npm: **auto** · standalone: **auto** (`qwen update`) · Homebrew: command |
| Kimi Code | npm, native installer, legacy `kimi-cli` (uv, pipx, pip) | npm: **auto** · native: **auto** on macOS/Linux (`kimi upgrade`), installer command on Windows · legacy: command |
| Aider | uv tool (`aider-install`, the install scripts), pipx, pip, Homebrew | uv: **auto** (`uv tool upgrade aider-chat`) · pipx: **auto** · pip, Homebrew: command |
| Mistral Vibe (`vibe`) | uv tool (install script), pipx, pip, Homebrew | uv: **auto** (`uv tool upgrade mistral-vibe`) · pipx: **auto** · pip, Homebrew: command |
| Cline CLI | npm | npm: **auto** · Homebrew: command |
| Amp | install script (`~/.amp/bin`), Homebrew tap, npm `@ampcode/cli` (or the old `@sourcegraph/amp`) | script: **auto** (`amp update`) · npm: **auto** · old npm name: migration command · Homebrew: command |
| Kiro CLI (`kiro-cli`) | install script, Windows 11 installer, Homebrew cask, dnf | installer: **auto** (`kiro-cli update`) · Homebrew, dnf: command |
| Goose | install script, Homebrew `block-goose-cli` | script: **auto** (`goose update`) · Homebrew: command |

### Dev CLIs

| Tool | Install methods detected | How it is updated |
| --- | --- | --- |
| Firebase CLI | npm, standalone binary | npm: **auto** · standalone: command |
| Google Cloud CLI | official installer, apt, snap, Homebrew | installer in a folder you can write to: **auto** (`gcloud components update`) · Program Files, read-only folders, apt, snap, Homebrew: command |
| npm | bundled with Node.js, global npm, Homebrew's Node | always a command |
| Wrangler | npm (Cloudflare recommends a per-project install) | npm: **auto** |
| Vercel CLI | npm | npm: **auto** |
| Netlify CLI | npm | npm: **auto** |
| Supabase CLI | Homebrew, Scoop, Linux packages, install script (npm only per project) | always a command |
| GitHub CLI (`gh`) | winget / MSI, Homebrew, apt, dnf, zypper, Scoop, Chocolatey, snap | winget: **auto** (per-user installs) · MSI and everything else: command (`gh` has no self-update) |

Install methods CCL CAUT recognizes (12): npm (any global prefix, including nvm, fnm and Volta), npm bundled with Node.js, vendor installers and install scripts ("native"), Homebrew, pip, uv, pipx, apt and other Linux package repositories, snap, winget, Chocolatey and Scoop.

"npm" means the global prefix of the npm on your `PATH`. Copies installed under another Node version (nvm, fnm, Volta) are detected too, and you get the right command to run with that version active.

### Gemini CLI retirement

Google retired Gemini CLI for consumer accounts (Google AI Pro and Ultra, and free use through Gemini Code Assist for individuals) on June 18, 2026; Antigravity CLI (`agy`) is the successor. Gemini CLI keeps working with Gemini Code Assist Standard/Enterprise licenses and paid API keys, so CCL CAUT still detects and can update it, but marks it **retired** and never preselects it. See [Google's announcement](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/).

## Safe by design

- **We only run what we can run safely.** Automatic updates are limited to `npm install -g` into your active npm prefix, `uv tool upgrade` and `pipx upgrade` for tools in their own environments, and the tools' own documented self-updaters, run against the exact binary on your `PATH`. winget runs automatically only for the tools on an allowlist (OpenCode, Antigravity CLI, GitHub CLI), each verified with a real silent upgrade from an older version, only for per-user installs (machine-wide ones need elevation), and only once winget has the version the vendor released: winget often lags behind, so until then the row says *waiting for winget*, and winget's own "no applicable update" answer counts as waiting, not as a failure. The command is `winget upgrade --id <Id> --exact --source winget --scope user --silent --accept-source-agreements --accept-package-agreements --disable-interactivity` ([flags](https://learn.microsoft.com/en-us/windows/package-manager/winget/upgrade)). Everything else (pip, apt, snap, Homebrew, other winget installs, Chocolatey, Scoop, admin-only folders, npm itself) gets the exact command and a one-line reason instead. Package-manager installs of the Google Cloud CLI never get `gcloud components update`.
- **Shadowed installs are called out.** CCL CAUT finds every copy of a tool on your `PATH`, updates the one that actually runs, and warns about copies that are installed but never run.
- **No false positives.** A generic binary name like Cursor's `agent`, `amp`, `goose` or `vibe` is only claimed where that tool installs itself (the Amp text editor or the pressly/goose migration tool are left alone, and are never run), and editor launcher shims (such as VS Code's Copilot Chat launcher) are ignored.
- **Every update is verified.** After an update, CCL CAUT asks the running binary for its version again. If it didn't change, you get a warning instead of a false success. Kimi Code's staged rollouts are reported as "held".
- **Checks before it touches anything.** The pre-flight check lists selected CLIs that are running (matched by their exact install path, never by a bare program name) and never kills anything. Under `--yes`, running tools and updates that need admin rights are skipped with a clear line each, counted in the summary, and make the exit code 1.
- **Admin rights up front.** CCL CAUT tests whether it can write where each update goes (the npm global folder, the Google Cloud SDK, a tool's own install folder) and tags updates that need more as **needs admin**: on Windows, run ccl-caut from a terminal opened with *Run as administrator*; on macOS and Linux, the command needs `sudo`. When ccl-caut already runs elevated there is no warning, and updates that were only blocked by permissions run automatically. It never elevates itself.
- **Friendly failure hints.** Locked files ("Claude Code appears to be running…") and permission problems are explained, with the last lines of output, not just dumped.
- **Careful inside agents.** Inside a Claude Code session, the pre-flight check offers to update everything except Claude Code (the default) or to include it. Under `--yes`, Claude Code is skipped: it is never updated without an explicit yes.

Platform support: developed and used daily on Windows. Detection rules for macOS and Linux (Homebrew, apt, snap, `~/.local/bin`, uv, pipx, nvm, fnm, Volta) are covered by fixture-based unit tests, every push runs the test suite plus a real scan, the scheduling recipes and an end-to-end self-update on Ubuntu, macOS and Windows runners (Node 20, 22 and 24), and a weekly canary installs the npm, uv and pipx CLIs for real on all three, reinstalls a Python tool that needs a newer Python, and upgrades winget packages on Windows, to catch upstream changes.

## Usage

```text
ccl-caut [options]

  --check        Scan and print the table only. Exit code 1 if updates exist, else 0.
  --json         Print the scan result as JSON (no banner, no colors).
                 Combined with --check, the exit code follows --check.
                 In a terminal you can then copy it or save it to a file.
  --output <file>
                 With --json: write the JSON to <file> (no prompt; prints the path
                 to stderr). Won't overwrite an existing file unless --force.
  --refresh      Ignore cached latest versions (cached for 1 hour) and look them up again.
  --discover     List every supported CLI with its official install docs.
                 (ccl-caut never installs tools.)
  --doctor       Check the connection to every version server (DNS, HTTPS, timings),
                 and show the proxy settings and cache/config paths in use.
  --pending      Print only the commands you still have to run yourself (for the tools
                 you selected; no table, no checklist). Exit code 1 if there are any.
  --only <group> Show one group for this run: agents (AI agents) or dev (Dev CLIs).
  --hide-group <group>, --show-group <group>
                 Hide a group from now on, or show it again (saved in your config).
  -y, --yes      Don't ask: update the tools that would be preselected (your remembered
                 choices, else every outdated tool that isn't retired or self-updating).
                 A newer global ccl-caut is updated too, last. Tools that are running
                 or need admin rights are skipped and listed; skips make the exit code 1.
  --reset-selection
                 Forget the selection remembered from previous runs, then run normally.
  --no-clear     Don't clear the screen when starting the interactive checklist.
  --no-color     Disable colors.
  -v, --version  Print the version.
  -h, --help     Show this help.

Keys (interactive):
  ↑/↓ move · space select · a all · enter confirm · q quit (nothing is changed)
  r retry the version lookups (offered when they failed); on "What next?", r rescans
  While the latest versions are checked: q stops, Ctrl+C or Esc cancel.
  Before updating, ccl-caut shows which selected CLIs are running and which
  updates need administrator rights (needs admin). It never kills or elevates.
```

The big CCL CAUT banner appears only on the default interactive run (`ccl-caut` with no options). Every option (`--check`, `--discover`, `--doctor`, `--help`, `--only`, `--hide-group`, `--show-group`, `--reset-selection`, `--yes`) starts with one compact line instead: *CCL CAUT v1.2.0 · CLI Agents Update Tool — by Creative Code Logic*. `--json`, `--version` (just the version number), piped output and CI runs print no header at all. Output that doesn't go to a terminal has no colors, on every OS (`FORCE_COLOR=1` keeps them).

The interactive checklist starts on a clean screen: earlier output is pushed up into your scrollback, never erased. Use `--no-clear` to keep it in view; `--check`, `--json`, `--yes` and CI runs never clear.

### Updating CCL CAUT itself

When a newer ccl-caut is published, a one-line notice under the banner tells you how to upgrade for the way you run it (`npx ccl-caut@latest` or `npm i -g ccl-caut`). The check runs in the background, never slows a run down, stays silent when offline, and is off in CI or with `CCL_CAUT_NO_UPDATE_CHECK=1`. If you run a beta (`ccl-caut@next`), the notice compares both channels and suggests the higher version, so you move on to the next beta or to the stable release, never backwards; stable users are never pointed at a beta. `--json` reports it as `"self": { "version", "latest", "next" }`.

If you installed ccl-caut globally with npm, the newer version is also a row of its own, **CCL CAUT**, at the top of the checklist: preselected, remembered like any tool, and applied by `--yes`. It runs `npm install -g ccl-caut@<version>` (the exact version) after every other update, then checks `ccl-caut --version`; the run ends with *CCL CAUT updated to 1.2.0. Run ccl-caut again to use it.* and offers only Quit, since the code still running is the old one. A copy under another Node version (nvm, fnm, Volta) gets the command to run instead; `npx` users already get the newest version with `npx ccl-caut@latest`, and source checkouts update with git, so neither gets the row.

### Discover supported tools

CCL CAUT updates what you already have; it never installs anything. `ccl-caut --discover` lists all 23 supported CLIs with a one-line description, whether each is installed (and which version runs), and a link to its official install docs. `--json` includes the same `docsUrl` for every tool. While some supported CLIs aren't installed, the scan line suggests `ccl-caut --discover`, until you have run it once.

### Groups

The table and the checklist are split into **AI agents** and **Dev CLIs** (Firebase, the Google Cloud CLI and npm). `--only agents` or `--only dev` shows one group for a single run. `--hide-group dev` hides a group from now on and `--show-group dev` brings it back; the choice is saved with your remembered selections, and the scan line reminds you (*Dev CLIs hidden · --show-group dev*). `--discover` and `--json` always cover every group.

### Inside a project

Run CCL CAUT inside a project and it reads the nearest `package.json` (stopping at the repository root) to see whether the project pins its own copy of a supported CLI. If it does, a note says so, because updating the global copy won't change what the project runs:

```text
i  firebase: This project pins firebase-tools ^13.0.0 (devDependencies; 13.29.1 in node_modules). Updating the global copy won't affect it; use `npx firebase` here.
```

It only reads: `package.json`, the lockfile and `node_modules` are never changed. Notes like this (marked with **i**) are information only; they never change a tool's state or what is preselected.

### Python tools

For CLIs installed from PyPI, CCL CAUT recognizes [uv](https://docs.astral.sh/uv/reference/storage/) tool environments, [pipx](https://pipx.pypa.io/latest/reference/environment-variables/) environments (including `UV_TOOL_DIR`, `PIPX_HOME` and the older pipx locations) and plain pip installs, and reads the installed version from the package metadata. uv and pipx installs update automatically (`uv tool upgrade`, `pipx upgrade`); pip installs get the command to run yourself, because system and externally-managed Pythons (PEP 668) make an automatic `pip install --upgrade` unsafe.

A new release can need a newer Python than the one a tool was installed with (Mistral Vibe 3.0 needs Python 3.14+). `uv tool upgrade` and `pipx upgrade` can't move such an install, so CCL CAUT reads the environment's Python version (`pyvenv.cfg`) and the release's `requires_python` from PyPI. If they don't match, the row still says *update available*, a note explains why, and the update is a command to copy that rebuilds the environment with a fitting Python: `uv tool upgrade --python 3.14 mistral-vibe` or `pipx reinstall --python 3.14 mistral-vibe` (pip: the matching `pip install --upgrade`). It is never preselected. When either version is unknown, nothing changes.

### Remembered selections

When you confirm the checklist, CCL CAUT remembers your choice per tool: ticked tools are preselected next time, unticked ones start unticked ("Selection remembered from your last run" appears under the prompt). Tools you've never decided on follow the defaults: preselected if outdated, unticked if retired or self-updating. `--yes` applies the same selection without asking, which makes it handy for a scheduled task. `--reset-selection` forgets every tool selection (hidden groups and other settings stay).

Choices are stored in your OS config folder: `%APPDATA%\ccl-caut\config.json` on Windows, and `$XDG_CONFIG_HOME/ccl-caut/config.json` or `~/.config/ccl-caut/config.json` on macOS and Linux (like other developer CLIs). Latest versions are cached for an hour in your OS cache folder (`%LOCALAPPDATA%\ccl-caut`, `~/Library/Caches/ccl-caut` or `$XDG_CACHE_HOME/ccl-caut`). Set `CCL_CAUT_DEBUG=1` to see failed lookups and config or cache problems on stderr, and `CCL_CAUT_NO_LIVE=1` to turn off the live table (a spinner, then the finished table, as in 1.1).

### Scheduled runs

Run `ccl-caut --check` (notify only, recommended) or `ccl-caut --yes` (update) weekly from cron, launchd or Task Scheduler, as your normal user. Without a terminal nothing waits for input: `--yes` skips tools that are running or need admin rights and says why, and the log is plain text. Each log ends with the commands still to run yourself (see [Still to do](#still-to-do)). Tested recipes for Linux, macOS and Windows, with logging and exit codes: [docs/scheduling.md](docs/scheduling.md).

### Privacy & network

CCL CAUT only reads public version information. It contacts exactly these hosts, and only to fetch latest-version metadata:

| Host | What for |
| --- | --- |
| `registry.npmjs.org` | Latest versions of npm-distributed tools (and Amp), and of ccl-caut itself |
| `api.github.com` | Latest releases of Antigravity CLI, Supabase CLI, GitHub CLI and Goose, and for winget installs on the allowlist the versions published in `microsoft/winget-pkgs` (cached for 6 hours) |
| `dl.google.com` | The Google Cloud SDK release feed |
| `pypi.org` | Aider, Mistral Vibe and legacy `kimi-cli` (latest version, and the Python version it requires) |
| `prod.download.cli.kiro.dev` | Kiro CLI's release manifest |

Nothing about you or your machine is sent: no identifiers, no list of installed tools, no telemetry or analytics of any kind. Requests are plain GETs (with a `ccl-caut` user agent), plus one tiny warm-up request to `registry.npmjs.org/-/ping`; `--doctor` sends a HEAD request to each host. If `GITHUB_TOKEN` (or `GH_TOKEN`) is set, it is sent to `api.github.com` only, to raise GitHub's limit of 60 unauthenticated requests per hour; it is never printed, logged or cached, and `--doctor` only says whether it is set. Results are cached for an hour in your OS cache folder (6 hours for GitHub releases), and your remembered selections stay in your OS config folder (see above). Update commands you choose to run (for example `claude update` or `npm install -g …`) contact their own vendors, exactly as if you ran them yourself.

### Slow or offline networks, proxies

A first run right after the machine wakes up can meet a cold network (DNS and TLS not ready yet). CCL CAUT handles that on its own:

- One quick warm-up request goes first, then the lookups share a few keep-alive connections per host instead of opening a dozen at once. The first attempt gets 8 seconds on a cold start, there is one retry, and the whole check never takes more than about 15 seconds. After 5 seconds the spinner says *(slow connection)*.
- If a lookup fails but an older answer is in the cache, that answer is used and marked, for example `0.162.1 cached 9h ago`. "unknown" only appears when there is nothing cached at all.
- When most or all lookups fail, you get one line that says why, instead of a column of question marks: *Couldn't reach the version servers (timed out). Showing installed versions only.* The reason is one of timed out, DNS lookup failed, no network connection, the proxy refused the connection, a certificate problem, or HTTP errors. Press **r** to retry. When only one source is down, just that row shows "unknown"; `CCL_CAUT_DEBUG=1` prints the reason.

Behind a corporate proxy, set `HTTPS_PROXY` (or `HTTP_PROXY`) and `NO_PROXY` as you would for curl or npm; CCL CAUT sends its lookups through it (credentials in the URL work, and are never printed).

`ccl-caut --doctor` checks the path to every version server and prints what it finds, ready to paste into a bug report:

```text
ccl-caut 1.2.0 doctor · Node v22.22.3 · win32 x64

Version servers
  ✔ registry.npmjs.org          reachable · DNS 28ms · HTTPS 200 in 332ms  (npm packages, Amp, ccl-caut itself)
  ✔ api.github.com              reachable · DNS 12ms · HTTPS 200 in 198ms  (Antigravity, Supabase, GitHub CLI, Goose, winget versions)
  ✖ dl.google.com               unreachable · DNS 21ms · timeout (timed out after 8.0s)  (Google Cloud CLI)
  ✔ pypi.org                    reachable · DNS 20ms · HTTPS 200 in 163ms  (Aider, Mistral Vibe, legacy kimi-cli)
  ✔ prod.download.cli.kiro.dev  reachable · DNS 126ms · HTTPS 200 in 273ms  (Kiro CLI)

Proxy
  HTTPS_PROXY  (not set)
  HTTP_PROXY   (not set)
  NO_PROXY     (not set)
  No proxy: lookups connect directly.

GitHub API
  token  not set (60 requests/hour per IP; set GITHUB_TOKEN for more)

Files
  cache   C:\Users\you\AppData\Local\ccl-caut\latest-versions.json (22 entries, newest 8m ago)
  config  C:\Users\you\AppData\Roaming\ccl-caut\config.json

1 of 5 version servers unreachable: dl.google.com.```

It exits with 0 when every server is reachable and 1 otherwise.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success, everything is up-to-date, nothing pending (`--pending`), or you quit with `q` |
| 1 | Updates available (`--check`), commands still to run (`--pending`), or an update failed, did not apply, or was skipped (`--yes`: running, needs admin rights) |
| 2 | Invalid arguments |
| 130 | Cancelled (Ctrl+C or Esc) |

`--check` is made for CI and scripts: `ccl-caut --check || echo "updates available"`.

### JSON output

```bash
ccl-caut --json                      # in a terminal: then Copy to clipboard / Save to file / Done
ccl-caut --json > scan.json          # scripts and pipes get exactly the JSON, nothing else
ccl-caut --json --output scan.json   # write the file, print its path to stderr (--force to overwrite)
```

In a terminal, `--json` prints the JSON and then offers **Copy to clipboard** (PowerShell `Set-Clipboard` on Windows, `pbcopy` on macOS, `wl-copy`, `xclip` or `xsel` on Linux), **Save to file** (prefilled with `./ccl-caut-report-YYYY-MM-DD.json`; asks before replacing a file) and, where a native save dialog works, **Browse…** (Windows, macOS, and Linux desktops with zenity or kdialog; never over SSH). `q` or **Done** leaves. When stdout isn't a terminal, in CI, or with `--yes`, there is no prompt and stdout carries only the JSON. `--output <file>` works in every mode and refuses to replace an existing file unless you add `--force`.

```json
{
  "tool": "ccl-caut",
  "version": "1.2.0",
  "self": { "version": "1.2.0", "latest": "1.2.0", "next": null },
  "generatedAt": "2026-10-20T09:00:01.000Z",
  "platform": "linux",
  "node": "v22.22.3",
  "latestCachedAt": null,
  "network": { "attempted": 14, "failures": [], "problem": null },
  "hiddenGroups": [],
  "summary": { "total": 23, "upToDate": 3, "outdated": 5, "notInstalled": 13, "unknown": 0, "retired": 1, "selfUpdating": 1, "shadowed": 1, "stale": 0 },
  "tools": [
    {
      "id": "gemini",
      "name": "Gemini CLI",
      "shortName": "Gemini",
      "group": "agents",
      "docsUrl": "https://github.com/google-gemini/gemini-cli",
      "installed": true,
      "installMethod": "npm",
      "binaryPath": "/usr/local/bin/gemini",
      "installedVersion": "0.62.1",
      "latestVersion": "0.63.0",
      "latestStaleCachedAt": null,
      "state": "retired",
      "updateAvailable": true,
      "needsAdmin": false,
      "plan": { "kind": "auto", "command": ["npm", "install", "-g", "@google/gemini-cli@latest"] },
      "shadowed": [],
      "deprecation": {
        "message": "retired for consumer accounts since Jun 2026 -> use Antigravity CLI (agy). Still works with enterprise licenses / paid API keys.",
        "successorId": "antigravity",
        "since": "2026-06-18",
        "url": "https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/"
      },
      "notes": [],
      "projectPin": null,
      "compatibility": null
    }
  ]
}```

`state` is one of `up-to-date`, `outdated`, `not-installed`, `unknown` (a version could not be determined; never reported as outdated), `retired` or `self-updating`. `updateAvailable` tells you whether a newer version exists, even for retired tools. `latestStaleCachedAt` is set (the time it was cached) when the live lookup failed and `latestVersion` comes from an expired cache entry; `summary.stale` counts those. `network.failures` lists failed lookups (`url`, `kind`: timeout, dns, offline, proxy, tls, http or connection, and `detail`), and `network.problem` holds the one-line explanation when most or all of them failed. `needsAdmin` is `true` when the update needs administrator rights (or `sudo`) that this run doesn't have. `plan.kind` is `auto` (CCL CAUT would run `command`) or `manual` (`command` is shown with a `reason`). `group` is `agents` or `dev`, and `hiddenGroups` lists the groups hidden with `--hide-group` (every tool is still included). `notes` holds info notes (`kind`, `message`, optional `url`); `projectPin` is set when the project in the current folder pins the tool (`packageJson`, `pkg`, `range`, `field`, `installedVersion`). `compatibility` is set when the latest release can't simply be installed over this copy, with the reason (for example *needs Python >=3.14* or *waiting for winget*); `plan` then holds the command to run instead, and the tool is never preselected. `installMethod` can also be `uv` or `pipx`. CCL CAUT's own version is in `self` (`latest`, and `next` for beta users), not in `tools`.

## Adding a new tool

Each CLI is one descriptor in [`src/registry/`](src/registry). For a CLI that ships on npm, the factory does most of the work:

```ts
// src/registry/mytool.ts
import { createNpmPackageTool } from "./npm-package-tool";
import { brewPlan } from "./shared";

export const mytool = createNpmPackageTool({
  id: "mytool",
  name: "My Tool",
  shortName: "MyTool",
  binNames: ["mytool"],
  pkg: "@acme/mytool",
  // Optional: plans for installs npm doesn't manage.
  otherPlan: (instance) => (instance.installMethod === "brew" ? brewPlan("mytool") : null),
});
```

Then add it to the list in [`src/registry/index.ts`](src/registry/index.ts). Tools with their own installer implement the `ToolDescriptor` interface directly (see `antigravity.ts`, `cursor.ts` and `gcloud.ts`): read the installed version, look up the latest one, and return an `auto` or `manual` update plan per install method. Optional fields cover `deprecation`, `selfUpdating`, `identify` (for generic binary names), `winget` (the winget package id, and `auto: true` once a real silent upgrade has been verified) and `checkCompatibility` (for example the Python version check). See [CONTRIBUTING.md](CONTRIBUTING.md) for tests.

## Roadmap

What 1.2 brings, what comes after it, and what's deliberately not planned: see [ROADMAP.md](ROADMAP.md).

## License

MIT © Creative Code Logic. See [LICENSE](LICENSE).

---

Built by [Creative Code Logic](https://creativecodelogic.com).