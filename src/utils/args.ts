export interface CliOptions {
  check: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
}

export type ParseResult = { ok: true; options: CliOptions } | { ok: false; error: string };

/** Minimal flag parser: the CLI only has boolean switches. */
export function parseArgs(argv: readonly string[]): ParseResult {
  const options: CliOptions = { check: false, json: false, help: false, version: false };
  for (const arg of argv) {
    switch (arg) {
      case "--check":
        options.check = true;
        break;
      case "--json":
        options.json = true;
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
  return `ccl-aut v${version} — Agents Update Tool by Creative Code Logic

Checks which AI/dev CLIs are installed, compares them with the latest
releases, and lets you pick which ones to update.

Usage:
  ccl-aut [options]

Options:
  --check        Scan and print the table only. Exit code 1 if updates exist, else 0.
  --json         Print the scan result as JSON (no banner, no colors).
                 Combined with --check, the exit code follows --check.
  --no-color     Disable colors.
  -v, --version  Print the version.
  -h, --help     Show this help.

Environment:
  CCL_AUT_DEBUG=1  Print diagnostics (e.g. failed registry lookups) to stderr.
`;
}
