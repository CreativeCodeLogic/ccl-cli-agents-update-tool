# Running CCL CAUT on a schedule

CCL CAUT can run unattended from cron (Linux), launchd (macOS) or Task Scheduler (Windows). Pick one of two modes:

| Mode | Command | What it does |
| --- | --- | --- |
| **Notify only** (recommended) | `ccl-caut --check` | Scans and writes the table to a log. Exit code 1 when updates are available. Changes nothing. |
| **Update** | `ccl-caut --yes` | Updates what would be preselected in the checklist: your remembered selections, else every outdated tool that isn't retired or self-updating, and a newer CCL CAUT itself (global npm installs, last). Prints the commands for everything it can't update itself. |

Start with notify only. Switch to `--yes` once you have seen a few logs and you're happy with what your checklist preselects. To keep a scheduled `--yes` from updating CCL CAUT itself, untick the **CCL CAUT** row once in an interactive run; the choice is remembered like any other.

## Before you start

- **Weekly is enough.** CLIs release often, but a weekly check catches everything without hammering the version servers.
- **Run it as your normal user. Never as root, with sudo, as Administrator or as an elevated ("highest privileges") task.** Global npm folders, Python tool folders and the config with your remembered selections are per user: an elevated run checks a different set of installs, and anything it updates ends up owned by the wrong user. Updates that need admin rights are skipped in `--yes` and listed with their command, for you to run by hand.
- **Start in your home folder.** Inside a project folder CCL CAUT adds a note when the project pins its own copy of a CLI; a scheduled run should not pick up whatever `package.json` happens to be in the scheduler's default folder (Task Scheduler starts in `C:\Windows\System32`, launchd in `/`). cron already starts in your home folder; the launchd and Task Scheduler recipes set it.
- **Schedulers start with a minimal environment.** cron and launchd give a job a `PATH` of roughly `/usr/bin:/bin`, so `node`, `npm` and the CLIs you want checked are not found. The recipes below call Node and CCL CAUT by absolute path, and set `PATH` to your normal one so CCL CAUT sees the same tools you do.

### What an unattended run does

When there is no terminal (a scheduler, a pipe, output redirected to a file), CCL CAUT never waits for input:

- No prompts. `--yes` decides on its own: a CLI that is **running** is skipped, an automatic update that **needs admin rights** is skipped (ccl-caut never elevates itself), and **Claude Code** is skipped when ccl-caut itself runs inside a Claude Code session (the `CLAUDECODE` environment variable is set; a scheduler never sets it). Each skip is one line with the reason, and the run exits with 1.
- Update commands get no input either: a command that would ask a question sees end-of-input instead of waiting forever.
- Plain text: no banner, no clearing the screen, no colors, no clickable links, no spinners and no "Star it on GitHub" line. A log contains exactly what you'd read in a terminal, without escape codes.
- Without `--yes` or `--check`, a run without a terminal only prints the table and says to run it interactively; it never updates anything.

## Find your paths

Run these in your normal terminal, where `ccl-caut` works:

```bash
command -v node              # Node:         e.g. /home/you/.nvm/versions/node/v22.19.0/bin/node
echo "$(npm root -g)/ccl-caut/dist/index.js"   # CCL CAUT entry point
echo "$PATH"                 # your PATH, for the scheduler
```

Version managers:

| Setup | Node | CCL CAUT |
| --- | --- | --- |
| Node from your OS or Homebrew | `/usr/bin/node`, `/usr/local/bin/node` or `/opt/homebrew/bin/node` | `$(npm root -g)/ccl-caut/dist/index.js` |
| **nvm** | `~/.nvm/versions/node/<version>/bin/node` | `~/.nvm/versions/node/<version>/lib/node_modules/ccl-caut/dist/index.js` |
| **fnm** | `<FNM_DIR>/aliases/default/bin/node` | `<FNM_DIR>/aliases/default/lib/node_modules/ccl-caut/dist/index.js` |
| **Volta** | not needed | `~/.volta/bin/ccl-caut` (Volta's shim picks the Node version itself) |

- **nvm:** global packages belong to one Node version. When you switch your default version, install ccl-caut again there and update the paths.
- **fnm:** `command -v node` prints a temporary `fnm_multishells` path that disappears; use the `aliases/default` path instead. `FNM_DIR` is `~/.local/share/fnm` on Linux and `~/Library/Application Support/fnm` on macOS (older installs: `~/.fnm`); `fnm env` prints it.
- **Volta:** replace the two paths (Node and CCL CAUT) with the single `~/.volta/bin/ccl-caut`.

Write absolute paths: cron and launchd don't expand `~`.

## Linux: cron

Create the log folder, then add two lines with `crontab -e`, with your own paths and `PATH`:

```bash
mkdir -p ~/.local/state/ccl-caut
crontab -e
```

<!-- snippet: cron -->
```cron
PATH=/home/you/.nvm/versions/node/v22.19.0/bin:/home/you/.local/bin:/usr/local/bin:/usr/bin:/bin
0 9 * * 1 { date; /home/you/.nvm/versions/node/v22.19.0/bin/node /home/you/.nvm/versions/node/v22.19.0/lib/node_modules/ccl-caut/dist/index.js --check; echo "exit $?"; } >> /home/you/.local/state/ccl-caut/ccl-caut.log 2>&1
```

This runs every Monday at 09:00 and appends the date, the table and the exit code to `~/.local/state/ccl-caut/ccl-caut.log`. Replace `--check` with `--yes` for the update mode. cron only runs while the machine is on; [anacron](https://manpages.debian.org/anacron) or a systemd timer with `Persistent=true` catch up on missed runs.

Try the exact line once by hand, with cron's empty environment:

```bash
env -i HOME="$HOME" PATH=/usr/bin:/bin sh -c '{ date; /home/you/.nvm/versions/node/v22.19.0/bin/node /home/you/.nvm/versions/node/v22.19.0/lib/node_modules/ccl-caut/dist/index.js --check; echo "exit $?"; } >> /home/you/.local/state/ccl-caut/ccl-caut.log 2>&1'
tail -n 40 ~/.local/state/ccl-caut/ccl-caut.log
```

To stop: `crontab -e` and delete the two lines.

## macOS: launchd

Save this as `~/Library/LaunchAgents/com.creativecodelogic.ccl-caut.plist`, with your own paths (`/Users/you`, the Node version) and `PATH`:

<!-- snippet: plist -->
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.creativecodelogic.ccl-caut</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>date; "/Users/you/.nvm/versions/node/v22.19.0/bin/node" "/Users/you/.nvm/versions/node/v22.19.0/lib/node_modules/ccl-caut/dist/index.js" --check; echo "exit $?"</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/you</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/Users/you/.nvm/versions/node/v22.19.0/bin:/Users/you/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>1</integer>
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/Users/you/Library/Logs/ccl-caut.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/you/Library/Logs/ccl-caut.log</string>
</dict>
</plist>
```

Every Monday at 09:00 (or at the next wake-up, if the Mac was asleep) it appends the date, the table and the exit code to `~/Library/Logs/ccl-caut.log`, which Console.app can show too. Replace `--check` with `--yes` for the update mode. Then check, load and try it:

```bash
plutil -lint ~/Library/LaunchAgents/com.creativecodelogic.ccl-caut.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.creativecodelogic.ccl-caut.plist
launchctl kickstart gui/$(id -u)/com.creativecodelogic.ccl-caut    # run once now
tail -n 40 ~/Library/Logs/ccl-caut.log
```

To stop: `launchctl bootout gui/$(id -u)/com.creativecodelogic.ccl-caut`, then delete the plist. After editing the plist, `bootout` and `bootstrap` it again.

## Windows: Task Scheduler

In a normal (not elevated) PowerShell window:

<!-- snippet: powershell -->
```powershell
$node  = (Get-Command node).Source                                  # e.g. C:\Program Files\nodejs\node.exe
$entry = Join-Path (npm root -g) "ccl-caut\dist\index.js"           # the CCL CAUT entry point
# fnm: those paths are temporary (fnm_multishells); use fnm's default version instead.
if ($node -like "*fnm_multishells*") { $node = Join-Path $env:FNM_DIR "aliases\default\node.exe" }
if ($entry -like "*fnm_multishells*") { $entry = Join-Path $env:FNM_DIR "aliases\default\node_modules\ccl-caut\dist\index.js" }
$log   = Join-Path $env:LOCALAPPDATA "ccl-caut\ccl-caut.log"        # next to CCL CAUT's version cache
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null

# cmd.exe writes the date, the output and the exit code to the log (UTF-8, as printed).
$action    = New-ScheduledTaskAction -WorkingDirectory $env:USERPROFILE -Execute "cmd.exe" -Argument "/d /v:on /c `"(echo ==== %DATE% %TIME% & `"$node`" `"$entry`" --check & echo exit !ERRORLEVEL!) >> `"$log`" 2>&1`""
$trigger   = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName "ccl-caut weekly check" -Action $action -Trigger $trigger -Principal $principal -Settings $settings
```

This runs as you (`-RunLevel Limited`: never elevated), every Monday at 09:00, and catches up after the PC was off (`-StartWhenAvailable`). It runs while you're signed in, and a console window shows briefly. Replace `--check` with `--yes` for the update mode. Try it and read the log:

```powershell
Start-ScheduledTask -TaskName "ccl-caut weekly check"
Get-Content $log -Tail 40
```

Or as a one-liner in a Command Prompt (`cmd.exe`, not elevated), using the `ccl-caut` command on your `PATH`:

<!-- snippet: schtasks -->
```bat
schtasks /Create /TN "ccl-caut weekly check" /SC WEEKLY /D MON /ST 09:00 /TR "cmd /d /c cd /d \"%USERPROFILE%\" && ccl-caut --check >> \"%LOCALAPPDATA%\ccl-caut\ccl-caut.log\" 2>&1"
```

(Create the folder first: `mkdir "%LOCALAPPDATA%\ccl-caut"`. This variant logs the output without the date and exit-code lines.)

To stop: `Unregister-ScheduledTask -TaskName "ccl-caut weekly check"` (or `schtasks /Delete /TN "ccl-caut weekly check"`).

## Reading the log

Each run appends one block: the date, the scan, the summary and the exit code. Example (notify only, abridged):

```text
Mon Oct 20 09:00:01 UTC 2026
┌   Scan
│
◇  Found 10 of 23 supported CLIs
│
◇  Latest versions checked
│
     Tool              Installed  Latest   State             Via
  ─────────────────────────────────────────────────────────────────────────────
  AI agents
  ✔  Claude Code       2.1.304    2.1.304  up-to-date        npm
  ↑  Kimi Code         2.1.1      2.2.0    update available  native
  ...
└  1 update available, 8 up-to-date, 1 retired
exit 1
```

With `--yes`, the end shows what was done, one line per tool, for example `Skipping Codex CLI: it is running (1 process). Close it and run ccl-caut again.`, followed by the summary (`3 updated, 1 manual, 3 up-to-date, 1 skipped`). Commands it can't run itself are printed on their own line, ready to copy.

Every run's log ends with the to-do list: what you still have to run yourself (manual updates, and automatic ones that were skipped or failed), each command on a plain line under a `#` comment, then `Run ccl-caut --pending anytime to see what's left.` For example, after a scheduled `--yes` that skipped a running Codex:

```text
Still to do, run these yourself:

# Codex CLI (was running)
npm install -g @openai/codex@latest

# Google Cloud CLI (admin terminal)
sudo apt-get update && sudo apt-get install --only-upgrade google-cloud-cli

Run ccl-caut --pending anytime to see what's left.
```

`ccl-caut --pending` shows the same list on demand (exit 1 while something is left, 0 when nothing is), so it also works as a quick check after you've run the commands.

| Exit code | `--check` | `--yes` |
| --- | --- | --- |
| 0 | Everything is up-to-date | Every selected update applied (or nothing was selected) |
| 1 | Updates are available | An update failed, did not apply, or was skipped (running, needs admin, Claude Code session) |
| 2 | Invalid arguments | Invalid arguments |
| 130 | Cancelled | Cancelled |

The log grows by a few kilobytes a week; delete it whenever you like.

## Remembered selections

`--yes` uses the selections you made in the interactive checklist (stored in your user config: `%APPDATA%\ccl-caut\config.json` on Windows, `~/.config/ccl-caut/config.json` elsewhere). To change what a scheduled update run touches, run `ccl-caut` interactively and untick or tick tools; `--reset-selection` goes back to the defaults. This is one more reason to schedule it as your own user: another user (or root) has its own config.