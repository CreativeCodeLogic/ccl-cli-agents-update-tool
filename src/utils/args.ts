import { TOOL_GROUPS, type ToolGroup } from "../types";
import { helpFooter } from "../ui/links";

export interface CliOptions {
  /** --only agents|dev: show one group for this run. */
  only: ToolGroup | null;
  /** --hide-group / --show-group: persistent, saved in the config. */
  hideGroup: ToolGroup | null;
  showGroup: ToolGroup | null;
  /** --output <file> (with --json): write the JSON there instead of showing it. */
  output: string | null;
  /** --force: let --output overwrite an existing file. */
  force: boolean;
  check: boolean;
  json: boolean;
  refresh: boolean;
  /** List every supported tool with its official install docs (never installs). */
  discover: boolean;
  /** Check the network path to every version server, show proxy settings and file paths. */
  doctor: boolean;
  /** Print only the commands still to run yourself (exit 1 when there are any). */
  pending: boolean;
  /** --whats-new <tool>: print that tool's release notes for its latest version, no prompt. */
  whatsNew: string | null;
  /** --hide-whats-new / --show-whats-new: persistent, saved in the config. */
  hideWhatsNew: boolean;
  showWhatsNew: boolean;
  noClear: boolean;
  resetSelection: boolean;
  /** Non-interactive: update what would be preselected, no prompts. */
  yes: boolean;
  /** Hidden: fixture data, no real detection/network/processes (README GIF, docs). */
  demo: boolean;
  help: boolean;
  version: boolean;
}

export type ParseResult = { ok: true; options: CliOptions } | { ok: false; error: string };

const GROUP_FLAGS = { "--only": "only", "--hide-group": "hideGroup", "--show-group": "showGroup" } as const;

/** Minimal flag parser: boolean switches, plus the group flags that take agents|dev. */
export function parseArgs(argv: readonly string[]): ParseResult {
  const options: CliOptions = {
    only: null,
    hideGroup: null,
    showGroup: null,
    output: null,
    force: false,
    check: false,
    json: false,
    refresh: false,
    discover: false,
    doctor: false,
    pending: false,
    whatsNew: null,
    hideWhatsNew: false,
    showWhatsNew: false,
    noClear: false,
    resetSelection: false,
    yes: false,
    demo: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]!;
    const [flag = "", inline] = raw.startsWith("--") && raw.includes("=") ? [raw.slice(0, raw.indexOf("=")), raw.slice(raw.indexOf("=") + 1)] : [raw, undefined];
    if (flag in GROUP_FLAGS) {
      const value = inline ?? argv[++i];
      if (!value || !(TOOL_GROUPS as readonly string[]).includes(value)) {
        return { ok: false, error: `${flag} needs a group: ${TOOL_GROUPS.join(" or ")}` };
      }
      options[GROUP_FLAGS[flag as keyof typeof GROUP_FLAGS]] = value as ToolGroup;
      continue;
    }
    if (flag === "--output") {
      const value = inline ?? argv[++i];
      if (!value || value.startsWith("--")) return { ok: false, error: "--output needs a file name" };
      options.output = value;
      continue;
    }
    if (flag === "--whats-new") {
      const value = inline ?? argv[++i];
      if (!value || value.startsWith("-")) return { ok: false, error: "--whats-new needs a tool id (e.g. --whats-new codex)" };
      options.whatsNew = value;
      continue;
    }
    const arg = raw;
    switch (arg) {
      case "--force":
        options.force = true;
        break;
      case "--check":
        options.check = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--refresh":
        options.refresh = true;
        break;
      case "--discover":
        options.discover = true;
        break;
      case "--doctor":
        options.doctor = true;
        break;
      case "--pending":
        options.pending = true;
        break;
      case "--hide-whats-new":
        options.hideWhatsNew = true;
        break;
      case "--show-whats-new":
        options.showWhatsNew = true;
        break;
      case "--no-clear":
        options.noClear = true;
        break;
      case "--reset-selection":
        options.resetSelection = true;
        break;
      case "-y":
      case "--yes":
        options.yes = true;
        break;
      case "--demo": // intentionally not listed in --help
        options.demo = true;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "-v":
      case "--version":
        options.version = true;
        break;
      case "--no-color": // honored by picocolors directly
        break;
      default:
        return { ok: false, error: `Unknown option: ${arg}` };
    }
  }
  if (options.output && !options.json) return { ok: false, error: "--output works with --json" };
  if (options.hideWhatsNew && options.showWhatsNew) return { ok: false, error: "--hide-whats-new and --show-whats-new can't be used together" };
  if (options.hideGroup && options.hideGroup === options.showGroup) {
    return { ok: false, error: `--hide-group and --show-group both name ${options.hideGroup}` };
  }
  return { ok: true, options };
}

/**
 * --help. `title` = false when the shared header line is already printed above
 * it; `hyperlinks` makes the footer URLs clickable (OSC 8) where supported.
 */
export function helpText(version: string, title = true, hyperlinks = false): string {
  return `${title ? `ccl-caut v${version} — CLI Agents Update Tool by Creative Code Logic\n\n` : ""}Checks which AI/dev CLIs are installed, compares them with the latest
releases, and lets you pick which ones to update.

Usage:
  ccl-caut [options]

Options:
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
  --whats-new <tool>
                 Print the release notes of <tool>'s latest version (e.g. codex,
                 ccl-caut) and the official link. No prompt. Exit code 0 when notes
                 were shown, 1 when there are none or they couldn't be fetched,
                 2 for an unknown tool (the valid ids are listed).
  --only <group> Show one group for this run: agents (AI agents) or dev (Dev CLIs).
  --hide-group <group>, --show-group <group>
                 Hide a group from now on, or show it again (saved in your config).
  --hide-whats-new, --show-whats-new
                 Hide the "n what's new" key hint from now on, or show it again
                 (saved in your config; n keeps working either way).
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
  n what's new: the highlighted tool's release notes for its latest version, in a
    panel (↑/↓ scroll, o opens the official notes in your browser, q closes).
    On "What next?", n shows the notes of what was just updated.
  While the latest versions are checked: q stops, Ctrl+C or Esc cancel.
  Before updating, ccl-caut shows which selected CLIs are running and which
  updates need administrator rights (needs admin). It never kills or elevates.

Exit codes:
  0    success / everything up-to-date / quit with q / nothing pending (--pending)
  1    updates available (--check), commands still to run (--pending), or an
       update failed, did not apply or was skipped (--yes)
  2    invalid arguments
  130  cancelled (Ctrl+C or Esc)

Environment:
  CCL_CAUT_DEBUG=1             Print diagnostics (failed lookups, cache problems) to stderr.
  CCL_CAUT_NO_UPDATE_CHECK=1   Don't check whether a newer ccl-caut is available.
  CCL_CAUT_NO_LIVE=1           No live table: a spinner, then the finished table.
  GITHUB_TOKEN, GH_TOKEN       Raise GitHub's API limit (sent to api.github.com only).
  FORCE_COLOR=1                Keep colors when the output isn't a terminal.
  HTTPS_PROXY, HTTP_PROXY, NO_PROXY
                               Send version lookups through a proxy (like curl and npm).

${helpFooter(hyperlinks)}
`;
}
