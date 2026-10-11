# Demo GIF for the README, recorded against fixture data (`--demo`):
# no real detection, network, config or update commands run.
#
# Render: npm run build && vhs docs/demo.tape
# (or the "Demo GIF" workflow, which uploads docs/demo.gif as an artifact)
#
# Layout (100 cols): the checklist needs 60 rows (banner = top 10) and the pre-flight 64,
# so ~62 rows keep the banner visible at the checklist and scroll it off afterwards.

Output docs/demo.gif

Require node

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 1440
Set Padding 24
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set TypingSpeed 45ms
Set CursorBlink false

# Make `ccl-caut` resolve to this checkout's build without a global install.
Hide
Type "alias ccl-caut='node dist/index.js' && clear"
Enter
Sleep 300ms
Show

Type "ccl-caut --demo"
Sleep 600ms
Enter

# Banner, scan, the table in two groups (AI agents, Dev CLIs), notes (Wrangler's
# vendor note and the project that pins it) and the remembered checklist.
Sleep 5s

# Untick Kimi Code (4th item), then confirm: Codex (npm), Aider (uv), gcloud (manual), Netlify (npm).
Down@450ms 3
Sleep 500ms
Space
Sleep 1.2s
Enter

# Pre-flight: Codex CLI is running, so "Re-check" is preselected. Go up to "Update now".
Sleep 3s
Up
Sleep 900ms
Enter

# Live progress (spinner, elapsed time, latest output line), results, the gcloud
# command on its own line, the summary and the "What next?" menu.
Sleep 6.5s

# q quits from any prompt.
Type "q"
Sleep 3s
