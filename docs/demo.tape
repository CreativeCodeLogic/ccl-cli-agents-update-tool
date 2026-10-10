# Demo GIF for the README, recorded against fixture data (`--demo`):
# no real detection, network, config or update commands run.
#
# Render: npm run build && vhs docs/demo.tape
# (or the "Demo GIF" workflow, which uploads docs/demo.gif as an artifact)
#
# Layout: the checklist needs 45 rows and the finished run 55, so ~46 rows keep
# the banner fully visible at the checklist and fully scrolled off at the end.

Output docs/demo.gif

Require node

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 1180
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

# Banner, scan, table, notes and the remembered checklist.
Sleep 4.5s

# Untick Antigravity CLI (4th item), then confirm.
Down@450ms 3
Sleep 500ms
Space
Sleep 1.2s
Enter

# Simulated updates, re-checks and the summary (the loop point).
Sleep 4s
Sleep 3s