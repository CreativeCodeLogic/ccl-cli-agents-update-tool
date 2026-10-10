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

## Demo mode

`node dist/index.js --demo` (or `npm run dev -- --demo`) runs the full interactive UI against fixture data: an in-memory Linux machine with a mix of up-to-date tools, updates, a missing tool, a hidden install and a manual-only plan. It's used to record the README GIF (`docs/demo.tape`) and is handy for UI work.

Demo mode is safe by construction: it blocks process spawning, network access, cache writes and config reads/writes process-wide (`src/utils/sandbox.ts`), detects against a fake host, and runs "updates" through a fake executor that only prints. `test/demo.test.ts` asserts that nothing real can run, even through the real executor. The flag is intentionally not listed in `--help`.

To re-render the GIF, run the **Demo GIF** workflow (Actions → Demo GIF → Run workflow) and download the `demo-gif` artifact, or locally with [VHS](https://github.com/charmbracelet/vhs): `npm run build && vhs docs/demo.tape`.
## Testing the self-update notice

A source checkout never shows the "newer ccl-caut" notice. To see it before anything is published: `npm pack`, `npm install -g ./ccl-caut-<version>.tgz`, then add an entry `"ccl-caut:self": { "version": "<newer>", "fetchedAt": <Date.now()> }` to `latest-versions.json` in the cache folder and run `ccl-caut --check`. `npm uninstall -g ccl-caut` afterwards.

## Project layout

```text
src/
  index.ts            CLI entry: flags, scan, checklist, summary
  scan.ts             detect every copy on PATH -> latest versions -> state + plan
  types.ts            ToolDescriptor, UpdatePlan, ToolScan
  registry/           one descriptor per CLI
  ui/                 banner, table, progress, update runner
  demo/               --demo fixture runtime (no real side effects)
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
- Verify facts (package names, bin names, install paths, update commands) against the tool's **official** docs, install scripts and the registries, not blog posts; cite the source in a comment.
- Generic binary names (like Cursor's `agent`) need an `identify` hook that only claims files inside the tool's own install layout. Never run an unknown binary to find out what it is.
- Retired tools get `deprecation` (shown as "retired", never preselected); tools that keep themselves current without a public latest version get `selfUpdating: true` ("updates itself").

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