import { TOOL_GROUPS, type ToolGroup } from "../types";

export interface CliOptions {
  /** --only agents|dev: show one group for this run. */
  only: ToolGroup | null;
  /** --hide-group / --show-group: persistent, saved in the config. */
  hideGroup: ToolGroup | null;
  showGroup: ToolGroup | null;
  check: boolean;
  json: boolean;
  refresh: boolean;
  /** List every supported tool with its official install docs (never installs). */
  discover: boolean;
  /** Check the network path to every version server, show proxy settings and file paths. */
  doctor: boolean;
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
    check: false,
    json: false,
    refresh: false,
    discover: false,
    doctor: false,
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
    const arg = raw;
    switch (arg) {
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
  if (options.hideGroup && options.hideGroup === options.showGroup) {
    return { ok: false, error: `--hide-group and --show-group both name ${options.hideGroup}` };
  }
  return { ok: true, options };
}

export function helpText(version: string): string {
  return `ccl-caut v${version} — CLI Agents Update Tool by Creative Code Logic

Checks which AI/dev CLIs are installed, compares them with the latest
releases, and lets you pick which ones to update.

Usage:
  ccl-caut [options]

Options:
  --check        Scan and print the table only. Exit code 1 if updates exist, else 0.
  --json         Print the scan result as JSON (no banner, no colors).
                 Combined with --check, the exit code follows --check.
  --refresh      Ignore cached latest versions (cached for 1 hour) and look them up again.
  --discover     List every supported CLI with its official install docs.
                 (ccl-caut never installs tools.)
  --doctor       Check the connection to every version server (DNS, HTTPS, timings),
                 and show the proxy settings and cache/config paths in use.
  --only <group> Show one group for this run: agents (AI agents) or dev (Dev CLIs).
  --hide-group <group>, --show-group <group>
                 Hide a group from now on, or show it again (saved in your config).
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
  Before updating, ccl-caut shows which selected CLIs are running and which
  updates need administrator rights (needs admin). It never kills or elevates.

Exit codes:
  0    success / everything up-to-date / quit with q
  1    updates available (--check), or an update failed or did not apply
  2    invalid arguments
  130  cancelled (Ctrl+C or Esc)

Environment:
  CCL_CAUT_DEBUG=1             Print diagnostics (failed lookups, cache problems) to stderr.
  CCL_CAUT_NO_UPDATE_CHECK=1   Don't check whether a newer ccl-caut is available.
  HTTPS_PROXY, HTTP_PROXY, NO_PROXY
                               Send version lookups through a proxy (like curl and npm).
`;
}
