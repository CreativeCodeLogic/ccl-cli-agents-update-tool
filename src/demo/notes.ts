import type { ToolScan } from "../types";
import type { PopupContent } from "../whatsnew/popup";

/*
 * Made-up release notes for the demo's `n` key (What's new): no network. The
 * links are the tools' official pages from the registry, like the real popup.
 */

const GENERIC = (name: string, version: string) => `## ${version}

### Features

- Faster startup when many projects are open.
- New \`--json\` output for scripting, with **stable field names**.
- Settings can be shared through a project file (see [the docs](https://example.com/docs/settings)).

### Fixes

1. Fixed a crash when the terminal was resized during a long run.
2. Proxy settings from \`HTTPS_PROXY\` are honored for every request.
3. Clearer error when ${name} can't reach its update server.

### Notes

> These notes are sample text for the CCL CAUT demo.

\`\`\`
${name.toLowerCase().replace(/\s+/g, "-")} --version
\`\`\`
`;

const CJK = (version: string) => `## ${version}

### 新功能 (New)

- 支持更长的上下文窗口 🚀 (longer context window)
- 改进中文和日本語の表示 (better CJK rendering) ✨
- 新增 \`/review\` 命令

### 修复 (Fixes)

- 修复了在 Windows 终端中的光标问题 🐛
- 修复代理设置 (proxy settings)
`;

export function demoNotes(scan: ToolScan): PopupContent {
  const version = scan.latestVersion ?? "latest";
  const cjk = scan.id === "qwen" || scan.id === "kimi";
  return {
    tool: scan.name,
    version,
    state: "ready",
    notes: cjk ? CJK(version) : GENERIC(scan.name, version),
    link: scan.docsUrl,
    historyLink: scan.docsUrl,
    installed: scan.installedVersion,
    demo: true,
  };
}