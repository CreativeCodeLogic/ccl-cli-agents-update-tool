# Demo GIF for the README, recorded against fixture data (`--demo`):
# no real detection, network or update commands run.
#
# Render: npm run build && vhs docs/demo.tape
# (or the "Demo GIF" workflow, which uploads docs/demo.gif as an artifact)

Output docs/demo.gif

Require node

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 1000
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

# Banner, scan, table and the hidden-install warning.
Sleep 4s

# Untick Gemini CLI (second item), then confirm.
Down
Sleep 700ms
Space
Sleep 1.2s
Enter

# Simulated updates, re-checks and the summary.
Sleep 6.5s
Sleep 2.5s