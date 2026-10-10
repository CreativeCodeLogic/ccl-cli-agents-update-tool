export interface CliOptions {
  check: boolean;
  json: boolean;
  refresh: boolean;
  showAll: boolean;
  resetSelection: boolean;
  /** Non-interactive: update what would be preselected, no prompts. */
  yes: boolean;
  /** Hidden: fixture data, no real detection/network/processes (README GIF, docs). */
  demo: boolean;
  help: boolean;
  version: boolean;
}

export type ParseResult = { ok: true; options: CliOptions } | { ok: false; error: string };

/** Minimal flag parser: the CLI only has boolean switches. */
export function parseArgs(argv: readonly string[]): ParseResult {
  const options: CliOptions = {
    check: false,
    json: false,
    refresh: false,
    showAll: false,
    resetSelection: false,
    yes: false,
    demo: false,
    help: false,
    version: false,
  };
  for (const arg of argv) {
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
      case "--show-all":
        options.showAll = true;
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
  --show-all     Also list tools that are not installed.
  -y, --yes      Don't ask: update the tools that would be preselected (your remembered
                 choices, else every outdated tool that isn't retired or self-updating).
  --reset-selection
                 Forget the selection remembered from previous runs, then run normally.
  --no-color     Disable colors.
  -v, --version  Print the version.
  -h, --help     Show this help.

Exit codes:
  0    success / everything up-to-date
  1    updates available (--check), or an update failed or did not apply
  2    invalid arguments
  130  cancelled (Ctrl+C)

Environment:
  CCL_CAUT_DEBUG=1  Print diagnostics (failed lookups, cache problems) to stderr.
`;
}
