import { exec } from "./utils/exec";
import { getHost, pathFor, type Host } from "./utils/host";
import { normalizePath } from "./utils/paths";
import type { BinaryInstance } from "./types";

/** One running process: id and full command line (binary path + arguments). */
export interface ProcessInfo {
  pid: number;
  commandLine: string;
}

const LIST_TIMEOUT_MS = 2_000;

/**
 * Running processes with their command lines, or null when listing fails or
 * takes longer than 2s (callers then show a plain reminder). Read-only: it
 * never signals or kills anything.
 */
export async function listProcesses(host: Host = getHost()): Promise<ProcessInfo[] | null> {
  if (host.platform === "win32") {
    // npm CLIs run as node.exe, so the command line (with the package path) matters, not the name.
    const script = "Get-CimInstance Win32_Process | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress";
    const res = await exec("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], LIST_TIMEOUT_MS);
    if (!res.ok) return null;
    try {
      const raw = JSON.parse(res.stdout) as unknown;
      const rows = (Array.isArray(raw) ? raw : [raw]) as { ProcessId?: number; ExecutablePath?: string | null; CommandLine?: string | null }[];
      return rows
        .filter((r) => typeof r.ProcessId === "number")
        .map((r) => ({ pid: r.ProcessId!, commandLine: r.CommandLine || r.ExecutablePath || "" }));
    } catch {
      return null;
    }
  }
  const res = await exec("ps", ["-A", "-o", "pid=,args="], LIST_TIMEOUT_MS);
  if (!res.ok) return null;
  return res.stdout
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(.*)$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), commandLine: m[2] ?? "" }));
}

/**
 * Path text for matching: normalized separators and case, with doubled
 * separators collapsed (npm's Windows shims launch "...\npm\\node_modules\...").
 */
function comparable(text: string, platform: NodeJS.Platform): string {
  return normalizePath(text, platform).replace(/\/{2,}/g, "/");
}

/** Paths that identify a running copy of a tool: its binary (shim and target) and npm package folder. */
export function processSignatures(instance: Pick<BinaryInstance, "path" | "realPath">, npmPackage: string | undefined, host: Host): string[] {
  const path = pathFor(host.platform);
  const sigs = new Set<string>();
  const file = (p: string) => sigs.add(comparable(p, host.platform));
  // Folders end with "/" so @openai/codex never matches @openai/codex-sdk.
  const dir = (p: string) => sigs.add(`${comparable(p, host.platform)}/`);
  file(instance.realPath);
  file(instance.path);
  if (npmPackage) {
    // Windows shim: <prefix>/node_modules/<pkg>; POSIX: the symlink target lives inside it.
    dir(path.join(path.dirname(instance.path), "node_modules", ...npmPackage.split("/")));
    const real = normalizePath(instance.realPath, host.platform);
    const marker = normalizePath(`/node_modules/${npmPackage}`, host.platform);
    const i = real.indexOf(`${marker}/`);
    if (i >= 0) dir(real.slice(0, i + marker.length));
  }
  // A bare shim path like ".../npm/codex.cmd" is too generic once the package folder is known.
  return [...sigs].filter((s) => s.length > 3);
}

/**
 * How many running processes belong to each tool, matched on full paths only
 * (never on a bare program name). Our own process is ignored.
 */
export function countRunning(
  processes: readonly ProcessInfo[],
  tools: readonly { id: string; signatures: readonly string[] }[],
  platform: NodeJS.Platform,
  selfPid: number = process.pid,
): Map<string, number> {
  const counts = new Map<string, number>();
  const lines = processes
    .filter((p) => p.pid !== selfPid && p.commandLine)
    .map((p) => comparable(p.commandLine, platform));
  for (const tool of tools) {
    const n = lines.filter((line) => tool.signatures.some((sig) => line.includes(sig))).length;
    if (n > 0) counts.set(tool.id, n);
  }
  return counts;
}

export interface UnattendedSkip<T> {
  target: T;
  reason: "running" | "claude-session";
  processes: number;
}

/**
 * --yes: which selected tools to leave alone. Running tools are skipped (their
 * files are in use), and so is Claude Code when ccl-caut itself runs inside a
 * Claude Code session.
 */
export function splitUnattended<T extends { id: string; claudeAuto: boolean }>(
  targets: readonly T[],
  running: ReadonlyMap<string, number> | null,
  insideClaudeCode: boolean,
): { keep: T[]; skipped: UnattendedSkip<T>[] } {
  const keep: T[] = [];
  const skipped: UnattendedSkip<T>[] = [];
  for (const target of targets) {
    const n = running?.get(target.id) ?? 0;
    if (n > 0) skipped.push({ target, reason: "running", processes: n });
    else if (insideClaudeCode && target.claudeAuto) skipped.push({ target, reason: "claude-session", processes: 0 });
    else keep.push(target);
  }
  return { keep, skipped };
}
