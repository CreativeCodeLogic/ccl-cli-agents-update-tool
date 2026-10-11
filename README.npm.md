# CCL CAUT

**One command to check and update every AI coding CLI on your machine.**

Twelve CLIs. Ten ways to install them. One checklist.

CCL CAUT (**C**LI **A**gents **U**pdate **T**ool) finds the AI and developer CLIs you have installed, compares what you run with what's released, and lets you pick what to update from a single checklist. It supports 12 tools: Claude Code, Codex, GitHub Copilot, Cursor, OpenCode, Gemini, Antigravity, Qwen Code, Kimi Code, Firebase, the Google Cloud CLI and npm.

![CCL CAUT demo: scan, table, notes, remembered checklist and updates](https://cdn.jsdelivr.net/npm/ccl-caut@1.0.1/docs/demo.gif)

<sub>Recorded with `ccl-caut --demo` (fixture data, nothing real is updated).</sub>

## Quick start

```bash
npx ccl-caut            # run once, no install
```

```bash
npm install -g ccl-caut  # or keep it around
ccl-caut
```

Requires Node.js 20 or newer.

## What it looks like

```text
◇  Found 8 of 12 supported CLIs · ccl-caut --discover to see all

     Tool              Installed   Latest   State             Via
  ─────────────────────────────────────────────────────────────────────────────
  ✔  Claude Code       2.1.296     2.1.296  up-to-date        native
  ↑  Codex CLI         0.161.0     0.162.1  update available  npm
  ↻  Cursor CLI        2026.10.01  —        updates itself    native
  ⊘  Gemini CLI        0.62.1      0.63.0   retired           npm
  ↑  Antigravity CLI   1.3.1       1.3.3    update available  native
  ↑  Kimi Code         2.0.4       2.1.1    update available  native +1 hidden
  ↑  Google Cloud CLI  587.0.0     588.0.0  update available  apt needs admin
  ✔  npm               12.2.0      12.2.0   up-to-date        node
▲  gemini: retired for consumer accounts since Jun 2026 -> use Antigravity CLI (agy).
   Still works with enterprise licenses / paid API keys.
▲  kimi: native 2.0.4 runs; npm 2.1.1 is installed but shadowed on PATH

   needs admin = the command needs sudo
```

Then pick what to update: `↑/↓` move, `space` selects, `a` toggles all, `enter` confirms and `q` quits from any prompt without changing anything. Colors mean the same thing everywhere: green is done or up-to-date, amber needs action (selected, update available, needs admin), cyan updates itself, red is retired or failed, dim is not selected or secondary.

Before anything runs, a short **pre-flight** check shows which selected CLIs are running right now (close agent sessions and the IDEs or terminals that use them first) and which updates need administrator rights. Choose *Update now*, *Re-check*, *Back to selection* or *Quit*. Each update shows a spinner, the elapsed time and the latest output line, then collapses to `Codex CLI 0.161.0 → 0.162.1`; the full log is printed only when something fails (or with `CCL_CAUT_DEBUG=1`). Commands CCL CAUT can't run safely are printed on a line of their own, ready to select and copy. Afterwards, *Rescan* runs the whole check again with fresh versions, or *Quit*.

## Supported tools

| Tool | Install methods detected | How it is updated |
| --- | --- | --- |
| Claude Code | npm, native installer, Homebrew | npm: **auto** · native: **auto** (`claude update`) · Homebrew: command |
| Codex CLI | npm, Homebrew, standalone binary | npm: **auto** · others: command |
| GitHub Copilot CLI | npm, install script, Homebrew, winget | npm: **auto** · script: **auto** (`copilot update`) · Homebrew, winget: command |
| Cursor CLI (`agent`) | installer, Homebrew | installer: **updates itself** (`agent update` offered) · Homebrew: command |
| OpenCode | npm (v1 and v2), install script, Homebrew, Chocolatey, Scoop, winget | npm: **auto** · script: **auto** (`opencode upgrade`) · others: command |
| Gemini CLI | npm, Homebrew | **retired** for consumer accounts (see below) · npm: **auto** if you tick it · Homebrew: command |
| Antigravity CLI (`agy`) | install script, Homebrew, winget | script: **auto** (`agy update`) · Homebrew, winget: command |
| Qwen Code | npm, standalone installer, Homebrew | npm: **auto** · standalone: **auto** (`qwen update`) · Homebrew: command |
| Kimi Code | npm, native installer, legacy `kimi-cli` (uv, pipx, pip) | npm: **auto** · native: **auto** on macOS/Linux (`kimi upgrade`), installer command on Windows · legacy: command |
| Firebase CLI | npm, standalone binary | npm: **auto** · standalone: command |
| Google Cloud CLI | official installer, apt, snap, Homebrew | installer in a folder you can write to: **auto** (`gcloud components update`) · Program Files, read-only folders, apt, snap, Homebrew: command |
| npm | bundled with Node.js, global npm, Homebrew's Node | always a command |

"npm" means the global prefix of the npm on your `PATH`. Copies installed under another Node version (nvm, fnm, Volta) are detected too, and you get the right command to run with that version active.

### Gemini CLI retirement

Google retired Gemini CLI for consumer accounts (Google AI Pro and Ultra, and free use through Gemini Code Assist for individuals) on June 18, 2026; Antigravity CLI (`agy`) is the successor. Gemini CLI keeps working with Gemini Code Assist Standard/Enterprise licenses and paid API keys, so CCL CAUT still detects and can update it, but marks it **retired** and never preselects it. See [Google's announcement](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/).

## Safe by design

- **We only run what we can run safely.** Automatic updates are limited to `npm install -g` into your active npm prefix and the tools' own documented self-updaters, run against the exact binary on your `PATH`. Everything else (apt, snap, Homebrew, winget, Chocolatey, Scoop, admin-only folders, npm itself) gets the exact command and a one-line reason instead. Package-manager installs of the Google Cloud CLI never get `gcloud components update`.
- **Shadowed installs are called out.** CCL CAUT finds every copy of a tool on your `PATH`, updates the one that actually runs, and warns about copies that are installed but never run.
- **No false positives.** A generic binary name like Cursor's `agent` is only claimed inside Cursor's own install layout, and editor launcher shims (such as VS Code's Copilot Chat launcher) are ignored.
- **Every update is verified.** After an update, CCL CAUT asks the running binary for its version again. If it didn't change, you get a warning instead of a false success. Kimi Code's staged rollouts are reported as "held".
- **Checks before it touches anything.** The pre-flight check lists selected CLIs that are running (matched by their exact install path, never by a bare program name) and never kills anything. Under `--yes`, running tools are skipped with a clear line each and counted in the summary.
- **Admin rights up front.** CCL CAUT tests whether it can write where each update goes (the npm global folder, the Google Cloud SDK, a tool's own install folder) and tags updates that need more as **needs admin**: on Windows, run ccl-caut from a terminal opened with *Run as administrator*; on macOS and Linux, the command needs `sudo`. When ccl-caut already runs elevated there is no warning, and updates that were only blocked by permissions run automatically. It never elevates itself.
- **Friendly failure hints.** Locked files ("Claude Code appears to be running…") and permission problems are explained, with the last lines of output, not just dumped.
- **Careful inside agents.** Inside a Claude Code session, the pre-flight check offers to update everything except Claude Code (the default) or to include it. Under `--yes`, Claude Code is skipped: it is never updated without an explicit yes.

Platform support: developed and used daily on Windows. Detection rules for macOS and Linux (Homebrew, apt, snap, `~/.local/bin`, uv, pipx, nvm, fnm, Volta) are covered by fixture-based unit tests, every push runs the test suite plus a real scan on Ubuntu, macOS and Windows runners, and a weekly canary installs the npm-distributed CLIs for real to catch upstream changes.

## Usage

```text
ccl-caut [options]

  --check        Scan and print the table only. Exit code 1 if updates exist, else 0.
  --json         Print the scan result as JSON (no banner, no colors).
                 Combined with --check, the exit code follows --check.
  --refresh      Ignore cached latest versions (cached for 1 hour) and look them up again.
  --discover     List every supported CLI with its official install docs.
                 (ccl-caut never installs tools.)
  --doctor       Check the connection to every version server (DNS, HTTPS, timings),
                 and show the proxy settings and cache/config paths in use.
  -y, --yes      Don't ask: update the tools that would be preselected (your remembered
                 choices, else every outdated tool that isn't retired or self-updating).
                 Tools that are running right now are skipped and listed in the summary.
  --reset-selection
                 Forget the selection remembered from previous runs, then run normally.
  --no-clear     Don't clear the screen when starting the interactive checklist.
  --no-color     Disable colors.
  -v, --version  Print the version.
  -h, --help     Show this help.

Keys (interactive):
  ↑/↓ move · space select · a all · enter confirm · q quit (nothing is changed)
  r retry the version lookups (offered when they failed)
```

The interactive checklist starts on a clean screen: earlier output is pushed up into your scrollback, never erased. Use `--no-clear` to keep it in view; `--check`, `--json`, `--yes` and CI runs never clear.

When a newer ccl-caut is published, a one-line notice under the banner tells you how to upgrade for the way you run it (`npx ccl-caut@latest` or `npm i -g ccl-caut`). The check runs in the background, never slows a run down, stays silent when offline, and is off in CI or with `CCL_CAUT_NO_UPDATE_CHECK=1`. `--json` reports it as `"self": { "version", "latest" }`.

### Discover supported tools

CCL CAUT updates what you already have; it never installs anything. `ccl-caut --discover` lists all 12 supported CLIs with a one-line description, whether each is installed (and which version runs), and a link to its official install docs. `--json` includes the same `docsUrl` for every tool.

### Remembered selections

When you confirm the checklist, CCL CAUT remembers your choice per tool: ticked tools are preselected next time, unticked ones start unticked ("Selection remembered from your last run" appears under the prompt). Tools you've never decided on follow the defaults: preselected if outdated, unticked if retired or self-updating. `--yes` applies the same selection without asking, which makes it handy for a scheduled task. `--reset-selection` forgets everything.

Choices are stored in your OS config folder: `%APPDATA%\ccl-caut\config.json` on Windows, and `$XDG_CONFIG_HOME/ccl-caut/config.json` or `~/.config/ccl-caut/config.json` on macOS and Linux (like other developer CLIs). Latest versions are cached for an hour in your OS cache folder (`%LOCALAPPDATA%\ccl-caut`, `~/Library/Caches/ccl-caut` or `$XDG_CACHE_HOME/ccl-caut`). Set `CCL_CAUT_DEBUG=1` to see failed lookups and config or cache problems on stderr.

### Privacy & network

CCL CAUT only reads public version information. It contacts exactly these hosts, and only to fetch latest-version metadata:

| Host | What for |
| --- | --- |
| `registry.npmjs.org` | Latest versions of npm-distributed tools, and of ccl-caut itself |
| `api.github.com` | Antigravity CLI's latest release |
| `dl.google.com` | The Google Cloud SDK release feed |
| `pypi.org` | Legacy `kimi-cli` installs only |

Nothing about you or your machine is sent: no identifiers, no list of installed tools, no telemetry or analytics of any kind. Requests are plain GETs (with a `ccl-caut` user agent), plus one tiny warm-up request to `registry.npmjs.org/-/ping`; `--doctor` sends a HEAD request to each host. Results are cached for an hour in your OS cache folder, and your remembered selections stay in your OS config folder (see above). Update commands you choose to run (for example `claude update` or `npm install -g …`) contact their own vendors, exactly as if you ran them yourself.

### Slow or offline networks, proxies

A first run right after the machine wakes up can meet a cold network (DNS and TLS not ready yet). CCL CAUT handles that on its own:

- One quick warm-up request goes first, then the lookups share a few keep-alive connections per host instead of opening a dozen at once. The first attempt gets 8 seconds on a cold start, there is one retry, and the whole check never takes more than about 15 seconds. After 5 seconds the spinner says *(slow connection)*.
- If a lookup fails but an older answer is in the cache, that answer is used and marked, for example `0.162.1 cached 9h ago`. "unknown" only appears when there is nothing cached at all.
- When most or all lookups fail, you get one line that says why, instead of a column of question marks: *Couldn't reach the version servers (timed out). Showing installed versions only.* The reason is one of timed out, DNS lookup failed, no network connection, the proxy refused the connection, a certificate problem, or HTTP errors. Press **r** to retry. When only one source is down, just that row shows "unknown"; `CCL_CAUT_DEBUG=1` prints the reason.

Behind a corporate proxy, set `HTTPS_PROXY` (or `HTTP_PROXY`) and `NO_PROXY` as you would for curl or npm; CCL CAUT sends its lookups through it (credentials in the URL work, and are never printed).

`ccl-caut --doctor` checks the path to every version server and prints what it finds, ready to paste into a bug report:

```text
ccl-caut 1.0.1 doctor · Node v22.22.3 · win32 x64

Version servers
  ✔ registry.npmjs.org  reachable · DNS 29ms · HTTPS 200 in 272ms  (npm packages, ccl-caut itself)
  ✔ api.github.com      reachable · DNS 13ms · HTTPS 200 in 199ms  (Antigravity CLI)
  ✖ dl.google.com       unreachable · DNS 20ms · timeout (timed out after 8.0s)  (Google Cloud CLI)
  ✔ pypi.org            reachable · DNS 19ms · HTTPS 200 in 192ms  (legacy kimi-cli)

Proxy
  HTTPS_PROXY  (not set)
  HTTP_PROXY   (not set)
  NO_PROXY     (not set)
  No proxy: lookups connect directly.

Files
  cache   C:\Users\you\AppData\Local\ccl-caut\latest-versions.json (12 entries, newest 8m ago)
  config  C:\Users\you\AppData\Roaming\ccl-caut\config.json

1 of 4 version servers unreachable: dl.google.com.
```

It exits with 0 when every server is reachable and 1 otherwise.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success, everything is up-to-date, or you quit with `q` |
| 1 | Updates available (`--check`), or an update failed or did not apply |
| 2 | Invalid arguments |
| 130 | Cancelled (Ctrl+C or Esc) |

`--check` is made for CI and scripts: `ccl-caut --check || echo "updates available"`.

### JSON output

```bash
ccl-caut --json
```

```json
{
  "tool": "ccl-caut",
  "version": "1.0.0",
  "platform": "win32",
  "latestCachedAt": null,
  "network": { "attempted": 11, "failures": [], "problem": null },
  "summary": { "total": 12, "upToDate": 2, "outdated": 4, "notInstalled": 5, "unknown": 0, "retired": 1, "selfUpdating": 0, "shadowed": 1, "stale": 0 },
  "tools": [
    {
      "id": "gemini",
      "name": "Gemini CLI",
      "shortName": "Gemini",
      "docsUrl": "https://github.com/google-gemini/gemini-cli",
      "installed": true,
      "installMethod": "npm",
      "binaryPath": "C:\\Users\\you\\AppData\\Roaming\\npm\\gemini.cmd",
      "installedVersion": "0.63.0",
      "latestVersion": "0.63.0",
      "latestStaleCachedAt": null,
      "state": "retired",
      "updateAvailable": false,
      "needsAdmin": false,
      "plan": { "kind": "auto", "command": ["npm", "install", "-g", "@google/gemini-cli@latest"] },
      "shadowed": [],
      "deprecation": {
        "message": "retired for consumer accounts since Jun 2026 -> use Antigravity CLI (agy). Still works with enterprise licenses / paid API keys.",
        "successorId": "antigravity",
        "since": "2026-06-18",
        "url": "https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/"
      }
    }
  ]
}
```

`state` is one of `up-to-date`, `outdated`, `not-installed`, `unknown` (a version could not be determined; never reported as outdated), `retired` or `self-updating`. `updateAvailable` tells you whether a newer version exists, even for retired tools. `latestStaleCachedAt` is set (the time it was cached) when the live lookup failed and `latestVersion` comes from an expired cache entry; `summary.stale` counts those. `network.failures` lists failed lookups (`url`, `kind`: timeout, dns, offline, proxy, tls, http or connection, and `detail`), and `network.problem` holds the one-line explanation when most or all of them failed. `needsAdmin` is `true` when the update needs administrator rights (or `sudo`) that this run doesn't have. `plan.kind` is `auto` (CCL CAUT would run `command`) or `manual` (`command` is shown with a `reason`).

## Feedback

Found a bug or have an idea? Email [admin@creativecodelogic.com](mailto:admin@creativecodelogic.com) with your OS, terminal, `node --version`, `ccl-caut --version`, the `ccl-caut --json` output and, for network problems, `ccl-caut --doctor` (redact your username in paths).

## License

MIT © Creative Code Logic. See the LICENSE file in the package.

---

Built by [Creative Code Logic](https://creativecodelogic.com).
