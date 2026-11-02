# "What's new" sources per tool

Research for a future "What's new in <Tool> <version>" terminal popup. For each tool CCL CAUT supports, this file lists where the vendor publishes its official release notes, how a version number maps to its notes, and whether the popup can show the notes in the terminal (fetched with one API request) or should only link to them. Only vendor sources are used: official GitHub repos, official docs sites, and the npm and PyPI registries. Web pages are always "link only" (no HTML scraping).

**Verified 2026-10-24.** The "Latest" values come from the source CCL CAUT uses today (npm `/<pkg>/latest`, PyPI JSON, GitHub `releases/latest`, the Kiro manifest, or gcloud's `components-2.json`).

## Sources

| tool | source type | exact location | version -> notes mapping | verified example | plan |
|---|---|---|---|---|---|
| aider | CHANGELOG.md in repo (`HISTORY.md`). GitHub Releases stop at v0.86.0 | [Aider-AI/aider `HISTORY.md`](https://github.com/Aider-AI/aider/blob/main/HISTORY.md) (77 KB), also published as [aider.chat/HISTORY.html](https://aider.chat/HISTORY.html) | heading `### Aider v<version>` | PyPI **0.86.2** has **NO notes**: no `### Aider v0.86.2` heading (the file has 0.86.1 and then "main branch") and no release (the tag `v0.86.2` exists, but its release does not) | in-terminal (CHANGELOG section), falls back to the link |
| amp | web page only | [ampcode.com/news](https://ampcode.com/news) (redirects to /chronicle) | none. Versions look like `0.0.<epoch>-g<hash>` and the news page shows no version numbers | npm **0.0.1792828848-gc7cca4**: nothing is tied to this version. The newest news post is "Self-Hosted Orbs" (2026-10-22) | link only |
| antigravity | GitHub Releases | [google-antigravity/antigravity-cli releases](https://github.com/google-antigravity/antigravity-cli/releases) | tag `<version>` (no `v`) | **1.4.7**: [release 1.4.7](https://github.com/google-antigravity/antigravity-cli/releases/tag/1.4.7) (2.9 KB body) | in-terminal |
| claude | GitHub Releases (also `CHANGELOG.md`, 1.08 MB) | [anthropics/claude-code releases](https://github.com/anthropics/claude-code/releases). CHANGELOG headings `## <version>` | tag `v<version>` | npm **2.1.310**: [release v2.1.310](https://github.com/anthropics/claude-code/releases/tag/v2.1.310) (3.9 KB) | in-terminal (release, not the oversized CHANGELOG) |
| cline | GitHub Releases (monorepo) | [cline/cline releases](https://github.com/cline/cline/releases) | tag `cli-v<version>`. The repo also publishes `v4.x` (extension), `desktop-v*` and `sdk/sdk/v*` | npm **3.0.73**: [release cli-v3.0.73](https://github.com/cline/cline/releases/tag/cli-v3.0.73) | in-terminal |
| codex | GitHub Releases | [openai/codex releases](https://github.com/openai/codex/releases) (the root `CHANGELOG.md` is a 330-byte stub) | tag `rust-v<version>` | npm **0.164.0**: [release rust-v0.164.0](https://github.com/openai/codex/releases/tag/rust-v0.164.0) (27.8 KB) | in-terminal (truncate) |
| copilot | GitHub Releases (also `changelog.md`, 290 KB) | [github/copilot-cli releases](https://github.com/github/copilot-cli/releases). [changelog.md](https://github.com/github/copilot-cli/blob/main/changelog.md) headings `## <version> - <date>` | tag `v<version>`. Prereleases are `v<version>-N` | npm **1.0.103**: [release v1.0.103](https://github.com/github/copilot-cli/releases/tag/v1.0.103) | in-terminal |
| cursor | web page only | [cursor.com/docs/cli/changelog](https://cursor.com/docs/cli/changelog) (one page, CLI only) | headings `v<YYYY.MM.DD>`. The build `2026.10.01-e373342` maps only by its date prefix, and not every build has an entry | No Latest source. The newest entry is v2026.10.22 | link only |
| firebase | GitHub Releases | [firebase/firebase-tools releases](https://github.com/firebase/firebase-tools/releases) | tag `v<version>` | npm **15.34.1**: [release v15.34.1](https://github.com/firebase/firebase-tools/releases/tag/v15.34.1) | in-terminal |
| gcloud | release-notes file (plain Markdown, official) | [dl.google.com/.../rapid/RELEASE_NOTES](https://dl.google.com/dl/cloudsdk/channels/rapid/RELEASE_NOTES) (**1.76 MB**). Web version: [cloud.google.com/sdk/docs/release-notes](https://cloud.google.com/sdk/docs/release-notes) | heading `## <version> (<date>)`. `components-2.json` also names `release_notes_url: RELEASE_NOTES` | **590.0.1**: `## 590.0.1 (2026-10-22)` is the first section of the file | in-terminal with a `Range` request (newest notes are at the top), else link |
| gemini | GitHub Releases | [google-gemini/gemini-cli releases](https://github.com/google-gemini/gemini-cli/releases) | tag `v<version>`. Nightly and preview tags are prereleases | npm **0.65.0**: [release v0.65.0](https://github.com/google-gemini/gemini-cli/releases/tag/v0.65.0) | in-terminal |
| gh | GitHub Releases | [cli/cli releases](https://github.com/cli/cli/releases) | tag `v<version>` | **2.103.2**: [release v2.103.2](https://github.com/cli/cli/releases/tag/v2.103.2) | in-terminal |
| goose | GitHub Releases | [aaif-goose/goose releases](https://github.com/aaif-goose/goose/releases) (block/goose redirects here) | tag `v<version>` | **1.56.0**: [release v1.56.0](https://github.com/aaif-goose/goose/releases/tag/v1.56.0) | in-terminal |
| kimi | GitHub Releases (monorepo). Also `apps/kimi-code/CHANGELOG.md` | [MoonshotAI/kimi-code releases](https://github.com/MoonshotAI/kimi-code/releases). The legacy PyPI `kimi-cli` uses [MoonshotAI/kimi-cli](https://github.com/MoonshotAI/kimi-cli/releases) with tag `<version>` | tag `@moonshot-ai/kimi-code@<version>` (URL-encode it). CHANGELOG headings `## <version>` | npm **2.3.1**: [release @moonshot-ai/kimi-code@2.3.1](https://github.com/MoonshotAI/kimi-code/releases/tag/%40moonshot-ai/kimi-code%402.3.1). Legacy kimi-cli 1.52.0: [release 1.52.0](https://github.com/MoonshotAI/kimi-cli/releases/tag/1.52.0) | in-terminal |
| kiro | web page only | [kiro.dev/changelog/cli](https://kiro.dev/changelog/cli/) | URL `/changelog/cli/<major>-<minor>/` (dots become hyphens). Some patches have their own page (`2-33-1`), others are anchors (`2-29#patch-2-29-1`) | manifest **2.34.0**: [kiro.dev/changelog/cli/2-34/](https://kiro.dev/changelog/cli/2-34/) (2026-10-23) | link only |
| netlify | GitHub Releases (release-please) | [netlify/cli releases](https://github.com/netlify/cli/releases) | tag `v<version>` | npm **27.14.2**: [release v27.14.2](https://github.com/netlify/cli/releases/tag/v27.14.2) (one bug fix) | in-terminal |
| npm | GitHub Releases (monorepo, also `CHANGELOG.md` 168 KB) | [npm/cli releases](https://github.com/npm/cli/releases) | tag `v<version>`. Workspace tags (`arborist-v*`, `libnpm*-v*`) and the parallel v11 line share the list | npm **12.2.1**: [release v12.2.1](https://github.com/npm/cli/releases/tag/v12.2.1) | in-terminal |
| opencode | GitHub Releases | [anomalyco/opencode releases](https://github.com/anomalyco/opencode/releases) (sst/opencode redirects here) | tag `v<version>` for both lines | v1 npm `opencode-ai` **1.19.4**: [release v1.19.4](https://github.com/anomalyco/opencode/releases/tag/v1.19.4). v2 npm `@opencode/cli` **2.1.4** has **NO notes**: the tag `v2.1.4` exists, but it has no release | in-terminal (v1). v2 falls back to the link |
| qwen | GitHub Releases (monorepo) | [QwenLM/qwen-code releases](https://github.com/QwenLM/qwen-code/releases) | tag `v<version>`. `releases/latest` returns `sdk-typescript-v*`, and `desktop-v*` and `cua-driver-rs-v*` also exist | npm **0.26.0**: [release v0.26.0](https://github.com/QwenLM/qwen-code/releases/tag/v0.26.0) (36.9 KB) | in-terminal (truncate) |
| supabase | GitHub Releases | [supabase/cli releases](https://github.com/supabase/cli/releases) | tag `v<version>`. Beta and `3.0.0-next` prereleases have empty bodies | **2.122.0**: [release v2.122.0](https://github.com/supabase/cli/releases/tag/v2.122.0) | in-terminal |
| vercel | CHANGELOG.md in repo (**stale**). GitHub Releases are also stale | [vercel/vercel `packages/cli/CHANGELOG.md`](https://github.com/vercel/vercel/blob/main/packages/cli/CHANGELOG.md) (520 KB). Releases tagged `vercel@<version>` | heading `## <version>`. Tag `vercel@<version>` | npm **65.2.0** has **NO notes**: the CHANGELOG stops at 59.11.7 (last edited 2026-09-08), the releases stop at `vercel@58.4.4` (2026-07-30), and there is no `vercel@65.2.0` tag. Link to the [CLI docs](https://vercel.com/docs/cli) or [vercel.com/changelog](https://vercel.com/changelog) | link only |
| vibe | GitHub Releases (also `CHANGELOG.md`, 139 KB) | [mistralai/mistral-vibe releases](https://github.com/mistralai/mistral-vibe/releases). CHANGELOG headings `## [<version>] - <date>` | tag `v<version>` | PyPI **3.0.2**: [release v3.0.2](https://github.com/mistralai/mistral-vibe/releases/tag/v3.0.2) | in-terminal |
| wrangler | CHANGELOG.md in repo (monorepo). GitHub Releases lag behind | [cloudflare/workers-sdk `packages/wrangler/CHANGELOG.md`](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/CHANGELOG.md) (**1.7 MB**) | heading `## <version>`. Release tag `wrangler@<version>` | npm **4.152.0**: `## 4.152.0` is at the top of the CHANGELOG, but there is **no** `wrangler@4.152.0` release or tag (the newest is 4.151.3) | in-terminal with a `Range` request on the CHANGELOG |
| ccl-caut | GitHub Releases + CHANGELOG.md | [CreativeCodeLogic/ccl-cli-agents-update-tool releases](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/releases). `CHANGELOG.md` headings `## [<version>] - <date>` | tag `v<version>` | npm latest **1.1.0**: [release v1.1.0](https://github.com/CreativeCodeLogic/ccl-cli-agents-update-tool/releases/tag/v1.1.0). Beta 1.2.0-beta.3 is a prerelease with notes | in-terminal |

## Summary

**By source type (24 tools):**
- GitHub Releases: 17 (antigravity, claude, cline, codex, copilot, firebase, gemini, gh, goose, kimi, netlify, npm, opencode, qwen, supabase, vibe, ccl-caut)
- CHANGELOG or release-notes file: 4 (aider `HISTORY.md`, wrangler `CHANGELOG.md`, gcloud `RELEASE_NOTES`, vercel `CHANGELOG.md` (stale))
- Web page only: 3 (amp, cursor, kiro)
- None: 0. Vercel is effectively "none" for its current version.

**By plan:**
- In-terminal: 20. Aider and opencode v2 fall back to the link today, because their current versions have no notes.
- Link only: 4 (amp, cursor, kiro, vercel)

### Problem tools
- **aider**: PyPI 0.86.2 (2026-02-12) has no notes anywhere. Releases stop at v0.86.0, and `HISTORY.md` stops at v0.86.1.
- **amp**: the version is `0.0.<epoch>-g<hash>`, and the news page is not indexed by version.
- **cursor**: CCL CAUT has no Latest source. The build version `YYYY.MM.DD-hash` matches a changelog heading only by its date, and not every build has one.
- **kiro**: notes are on a web page only. The URL slug uses `major-minor` with hyphens, and some patches are anchors instead of pages.
- **vercel**: npm is at 65.2.0, but the repo CHANGELOG stopped at 59.11.7 and the releases stopped at 58.4.4.
- **wrangler**: the tag is `wrangler@<v>`, and the latest 4.152.0 has no release or tag yet. The CHANGELOG is 1.7 MB, so read it with a `Range` request.
- **gcloud**: `RELEASE_NOTES` is 1.76 MB, so read it with a `Range` request. The newest section is first.
- **claude**: the CHANGELOG is 1.08 MB, over the contents API limit, so use releases. 2 of the last 10 releases contain only "Bug fixes and reliability improvements", and 1 more is a one-liner.
- **cline / npm / qwen / kimi**: monorepos. Always build the tag (`cli-v`, `v`, `v`, `@moonshot-ai/kimi-code@`). Never use `releases/latest`, which returns `desktop-v*` for cline and `sdk-typescript-v*` for qwen.
- **codex**: the `rust-v` prefix, and many alpha prereleases. The list endpoint returned HTTP 504 once, so fetch by tag.
- **opencode**: the v2 line (`@opencode/cli` 2.1.4) has git tags but no releases.
- **antigravity**: tags have no `v` prefix.
- **codex / qwen**: release bodies are 20–37 KB, so the popup must truncate them.
- **ccl-caut**: npm `latest` is 1.1.0 while the beta channel is 1.2.0-beta.3. Prerelease tags have notes too.

### How often the latest version has no notes (last ~10 stable versions)
- **Never empty in the sample:** antigravity (1 of 10 is a one-liner), cline, copilot, firebase, gh, goose, kimi, mistral-vibe, supabase stable, qwen stable, npm, ccl-caut.
- **Sometimes only filler:**
  - claude: 2 of 10 say only "Bug fixes and reliability improvements".
  - gemini: 1 of 10 (v0.56.0) has only a "Full Changelog" link.
  - netlify: most bodies are a single "deps: update netlify packages" fix (in-terminal works, but the content is thin).
  - opencode v1: short but real bodies (170–850 B).
  - codex: patch releases (`x.y.1`) have short bodies of about 350 B.
- **Current latest has no notes at all:** aider 0.86.2, vercel 65.2.0, opencode v2 2.1.4. (wrangler 4.152.0 has notes in its CHANGELOG, just no release yet, which is why CAUT reads the CHANGELOG.)
- **Never indexed by version:** amp. Cursor is sometimes indexed by date.
- **Prerelease bodies are often empty:** supabase betas are 0 B, and codex alphas are about 25 B.

## Request per press

The feature makes one unauthenticated (or `GITHUB_TOKEN`) request per key press, cached. 404 or empty body: show "No release notes for <version>" plus the link.

| tool | single request |
|---|---|
| antigravity | `GET /repos/google-antigravity/antigravity-cli/releases/tags/<v>` |
| claude | `GET /repos/anthropics/claude-code/releases/tags/v<v>` |
| cline | `GET /repos/cline/cline/releases/tags/cli-v<v>` |
| codex | `GET /repos/openai/codex/releases/tags/rust-v<v>` |
| copilot | `GET /repos/github/copilot-cli/releases/tags/v<v>` |
| firebase | `GET /repos/firebase/firebase-tools/releases/tags/v<v>` |
| gemini | `GET /repos/google-gemini/gemini-cli/releases/tags/v<v>` |
| gh | `GET /repos/cli/cli/releases/tags/v<v>` |
| goose | `GET /repos/aaif-goose/goose/releases/tags/v<v>` |
| kimi | `GET /repos/MoonshotAI/kimi-code/releases/tags/%40moonshot-ai%2Fkimi-code%40<v>`. Legacy: `GET /repos/MoonshotAI/kimi-cli/releases/tags/<v>` |
| netlify | `GET /repos/netlify/cli/releases/tags/v<v>` |
| npm | `GET /repos/npm/cli/releases/tags/v<v>` |
| opencode | `GET /repos/anomalyco/opencode/releases/tags/v<v>` (v2 currently 404) |
| qwen | `GET /repos/QwenLM/qwen-code/releases/tags/v<v>` |
| supabase | `GET /repos/supabase/cli/releases/tags/v<v>` |
| vibe | `GET /repos/mistralai/mistral-vibe/releases/tags/v<v>` |
| ccl-caut | `GET /repos/CreativeCodeLogic/ccl-cli-agents-update-tool/releases/tags/v<v>` |
| aider | `GET /repos/Aider-AI/aider/contents/HISTORY.md` with `Accept: application/vnd.github.raw` (77 KB), then extract `### Aider v<v>` |
| wrangler | `GET https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/CHANGELOG.md` with `Range: bytes=0-65535` (HTTP 206 verified), then extract `## <v>`. Older versions need a larger range or the link. Do not use the contents API: the file is 1.7 MB |
| gcloud | `GET https://dl.google.com/dl/cloudsdk/channels/rapid/RELEASE_NOTES` with `Range: bytes=0-65535` (HTTP 206 verified), then extract `## <v> (`. The full file is 1.76 MB |
| amp, cursor, kiro, vercel | no request; open or print the link |

Notes: the GitHub contents API returns content inline only for files up to 1 MB. Larger files (claude 1.08 MB, wrangler 1.7 MB) need the raw media type or raw.githubusercontent.com, so a ranged raw read is preferred. Release bodies are Markdown and should be rendered or stripped and truncated for the terminal.
