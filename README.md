# CCL CAUT

**One command to check and update every AI coding CLI on your machine.**

[![CI](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/actions/workflows/ci.yml/badge.svg)](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](package.json)

CCL CAUT (**C**LI **A**gents **U**pdate **T**ool) finds the AI and developer CLIs you have installed (Claude Code, Codex, Gemini, Kimi Code, Firebase, Google Cloud CLI, npm), compares what you run with what's released, and lets you pick what to update from a single checklist.

<!-- demo.gif goes here -->

## Quick start

> **Coming to npm soon.** Until then, run it from source (below).

```bash
npx ccl-caut            # run once, no install
npm install -g ccl-caut  # or keep it around
ccl-caut
```

From source:

```bash
git clone https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool.git
cd ccl-cli-agents-update-tool
npm ci && npm run build
node dist/index.js
```

Requires Node.js 20 or newer.

## What it looks like

```text
     Tool              Installed  Latest   State             Via
  ───────────────────────────────────────────────────────────────────────────
  ↑  Claude Code       2.1.295    2.1.296  update available  npm
  ✔  Codex CLI         0.162.1    0.162.1  up-to-date        npm
  ✔  Gemini CLI        0.63.0     0.63.0   up-to-date        npm
  ↑  Kimi Code         0.28.1     2.1.1    update available  native +1 hidden
  ↑  Firebase CLI      15.32.1    15.33.0  update available  npm
  ↑  Google Cloud CLI  563.0.0    588.0.0  update available  native
  ✔  npm               12.2.0     12.2.0   up-to-date        npm
▲  kimi: running native 0.28.1 (~\.kimi-code\bin); npm @moonshot-ai/kimi-code 2.1.1
   (~\AppData\Roaming\npm) is installed but never runs (shadowed on PATH).
```

Outdated tools are pre-selected in a checklist (space toggles, enter confirms). Updates CCL CAUT can run safely run with live output; everything else is shown as a ready-to-copy command.

## Supported tools

| Tool | Install methods detected | How it is updated |
| --- | --- | --- |
| Claude Code | npm, native installer (`~/.local/bin`), Homebrew | npm: **auto** · native: **auto** (`claude update`) · Homebrew: command shown |
| Codex CLI | npm, Homebrew, standalone binary | npm: **auto** · others: command shown |
| Gemini CLI | npm, Homebrew | npm: **auto** · Homebrew: command shown |
| Kimi Code | npm, native installer (`~/.kimi-code`), legacy `kimi-cli` (uv, pipx, pip) | npm: **auto** · native: **auto** (`kimi upgrade`) · legacy: command shown |
| Firebase CLI | npm, standalone binary | npm: **auto** · standalone: command shown |
| Google Cloud CLI | official installer, apt, snap, Homebrew | official installer in a folder you can write to: **auto** (`gcloud components update`) · Program Files, read-only folders, apt, snap, Homebrew: command shown |
| npm | bundled with Node.js, global npm | always command shown |

"npm" means the global prefix of the npm on your `PATH`. Copies installed under another Node version (nvm, fnm, Volta) are detected too, and you get the right command to run with that version active.

## Safe by design

- **We only run what we can run safely.** Automatic updates are limited to `npm install -g` into your active npm prefix and the tools' own documented self-updaters, run against the exact binary on your `PATH`. Everything else (apt, snap, Homebrew, admin-only folders, npm itself) gets the exact command and a one-line reason instead. Package-manager installs of the Google Cloud CLI never get `gcloud components update`.
- **Shadowed installs are called out.** CCL CAUT finds every copy of a tool on your `PATH`, updates the one that actually runs, and warns about copies that are installed but never run.
- **Every update is verified.** After an update, CCL CAUT asks the running binary for its version again. If it didn't change, you get a warning instead of a false success. Kimi Code's staged rollouts (new versions roll out over ~24h) are reported as "held".
- **Friendly failure hints.** Locked files ("Claude Code appears to be running…") and permission problems ("run from an elevated terminal") are explained, not just dumped.
- **Careful inside agents.** Updating Claude Code from inside a Claude Code session asks for confirmation first.

Platform support: developed and used daily on Windows. Detection rules for macOS and Linux (Homebrew, apt, snap, `~/.local/bin`, uv, pipx, nvm, fnm, Volta) are covered by fixture-based unit tests, and every push runs the test suite plus a real scan on Ubuntu, macOS and Windows runners in CI.

## Usage

```text
ccl-caut [options]

  --check        Scan and print the table only. Exit code 1 if updates exist, else 0.
  --json         Print the scan result as JSON (no banner, no colors).
                 Combined with --check, the exit code follows --check.
  --refresh      Ignore cached latest versions (cached for 1 hour) and look them up again.
  --no-color     Disable colors.
  -v, --version  Print the version.
  -h, --help     Show this help.
```

Latest versions are cached for an hour in your OS cache folder (`%LOCALAPPDATA%\ccl-caut`, `~/Library/Caches/ccl-caut`, or `$XDG_CACHE_HOME/ccl-caut`). Set `CCL_CAUT_DEBUG=1` to see failed lookups and cache problems on stderr.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success, or everything is up-to-date |
| 1 | Updates available (`--check`), or an update failed or did not apply |
| 2 | Invalid arguments |
| 130 | Cancelled (Ctrl+C) |

`--check` is made for CI and scripts: `ccl-caut --check || echo "updates available"`.

### JSON output

```bash
ccl-caut --json
```

```json
{
  "tool": "ccl-caut",
  "version": "0.1.0",
  "platform": "win32",
  "latestCachedAt": null,
  "summary": { "total": 7, "upToDate": 3, "outdated": 4, "notInstalled": 0, "unknown": 0, "shadowed": 1 },
  "tools": [
    {
      "id": "kimi",
      "name": "Kimi Code",
      "installed": true,
      "installMethod": "native",
      "binaryPath": "C:\\Users\\you\\.kimi-code\\bin\\kimi.exe",
      "installedVersion": "0.28.1",
      "latestVersion": "2.1.1",
      "state": "outdated",
      "plan": { "kind": "auto", "command": ["C:\\Users\\you\\.kimi-code\\bin\\kimi.exe", "upgrade"] },
      "shadowed": [
        { "path": "C:\\Users\\you\\AppData\\Roaming\\npm\\kimi.cmd", "installMethod": "npm", "version": "2.1.1" }
      ]
    }
  ]
}
```

`state` is one of `up-to-date`, `outdated`, `not-installed` or `unknown` (a version could not be determined; never reported as outdated). `plan.kind` is `auto` (CCL CAUT would run `command`) or `manual` (`command` is shown with a `reason`).

## Adding a new tool

Each CLI is one descriptor in [`src/registry/`](src/registry). For a CLI that ships on npm, the factory does most of the work:

```ts
// src/registry/mytool.ts
import { createNpmPackageTool } from "./npm-package-tool";
import { brewPlan } from "./shared";

export const mytool = createNpmPackageTool({
  id: "mytool",
  name: "My Tool",
  binNames: ["mytool"],
  pkg: "@acme/mytool",
  // Optional: plans for installs npm doesn't manage.
  otherPlan: (instance) => (instance.installMethod === "brew" ? brewPlan("mytool") : null),
});
```

Then add it to the list in [`src/registry/index.ts`](src/registry/index.ts). Tools with their own installer implement the `ToolDescriptor` interface directly (see `gcloud.ts` and `kimi.ts`): read the installed version, look up the latest one, and return an `auto` or `manual` update plan per install method. See [CONTRIBUTING.md](CONTRIBUTING.md) for tests.

## License

MIT © Creative Code Logic. See [LICENSE](LICENSE).

---

Built by **Creative Code Logic**.