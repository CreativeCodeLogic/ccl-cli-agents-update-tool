# Contributing to CCL CAUT

Thanks for helping! Bug reports, new tools and detection fixes for your platform are all welcome.

## Setup

Requires Node.js 20+.

```bash
git clone https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool.git
cd ccl-cli-agents-update-tool
npm ci
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run from source with tsx (`npm run dev -- --check`) |
| `npm run build` | Bundle to `dist/index.js` with tsup |
| `npm run typecheck` | Strict TypeScript check (sources and tests) |
| `npm test` | Run the vitest suite once |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Tests with coverage for `src/registry`, `src/utils` and `src/scan.ts` |

Set `CCL_CAUT_DEBUG=1` to see failed lookups and cache problems on stderr.

## Project layout

```text
src/
  index.ts            CLI entry: flags, scan, checklist, summary
  scan.ts             detect every copy on PATH -> latest versions -> state + plan
  types.ts            ToolDescriptor, UpdatePlan, ToolScan
  registry/           one descriptor per CLI
  ui/                 banner, table, progress, update runner
  utils/              PATH discovery, install-method rules, npm, http, cache, host
test/                 vitest suites (no network or real installs needed)
```

## Adding a tool

1. Create `src/registry/<id>.ts`. For an npm-distributed CLI use `createNpmPackageTool` (see `codex.ts`); otherwise implement `ToolDescriptor` (see `gcloud.ts`, `kimi.ts`).
2. Register it in `src/registry/index.ts`.
3. Add plan tests in `test/plans.test.ts` for each install method you support.

Ground rules for descriptors:

- **Never throw.** Return `null` for unknown versions; the scan treats unknown as "unknown", never "outdated".
- **`auto` only when it's safe**: npm installs in the active prefix, or a documented self-updater run on the exact binary (`instance.path`). Everything else is `manual` with the exact command and a one-line `reason`.
- Read platform, home directory, environment and filesystem through `getHost()`, never through `process`/`os`/`fs` directly, so the rules stay testable.

## Testing platform rules

Detection is a pure function of a `Host`, so you can test Windows, macOS and Linux rules on any machine with `fakeHost()` from `test/helpers.ts`:

```ts
const host = fakeHost({
  platform: "darwin",
  homedir: "/Users/jane",
  env: { PATH: "/opt/homebrew/bin" },
  files: ["/opt/homebrew/bin/gemini"],
  links: { "/opt/homebrew/bin/gemini": "/opt/homebrew/Cellar/gemini-cli/0.63.0/bin/gemini" },
});
```

If CCL CAUT misdetects something on your machine, a fixture in `test/installMethod.test.ts` with the real paths (home directory anonymized) is the most useful bug report.

## Pull requests

- Keep `npm run typecheck`, `npm run build` and `npm test` green; CI runs them on Ubuntu, macOS and Windows.
- One logical change per commit, with a message that says why.
- Code comments in English, concise.

By contributing you agree that your contributions are licensed under the MIT License.