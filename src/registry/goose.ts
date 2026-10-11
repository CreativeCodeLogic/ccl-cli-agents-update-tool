import type { BinaryInstance, ToolDescriptor, UpdatePlan } from "../types";
import { exec } from "../utils/exec";
import { fetchLatestGithubRelease, GITHUB_CACHE_TTL_MS } from "../utils/github";
import { envVar, getHost, pathFor, type Host } from "../utils/host";
import { isInside, normalizePath } from "../utils/paths";
import { fromBrewToken } from "./detect-helpers";
import { versionFromCommand } from "./shared";

/*
 * goose-docs.ai/docs/getting-started/installation/: the download_cli.sh script
 * (releases of aaif-goose/goose, formerly block/goose) installs to
 * $GOOSE_BIN_DIR, default ~/.local/bin (Git Bash on Windows: %USERPROFILE%\goose);
 * download_cli.ps1 uses %USERPROFILE%\.local\bin. Homebrew's CLI formula is
 * block-goose-cli. `goose update` replaces the binary in place.
 *
 * `goose` is also pressly/goose, the Go database-migration tool (~/go/bin,
 * `brew install goose`), which prints "goose version: v3.x". Goose prints a bare
 * version (" 1.54.0"). Never run `goose version`: it is a DB command in pressly.
 */
const REPO = "aaif-goose/goose";

/** Folders the official Goose installers use. */
function gooseDirs(host: Host): string[] {
  const path = pathFor(host.platform);
  const dirs = [envVar(host, "GOOSE_BIN_DIR"), path.join(host.homedir, ".local", "bin")];
  if (host.platform === "win32") dirs.push(path.join(host.homedir, "goose"));
  return dirs.filter((d): d is string => Boolean(d));
}

/**
 * From the path alone: "goose" (block-goose-cli formula), "other" (pressly's
 * usual places or anywhere Goose doesn't install), or "check" (a Goose install
 * folder, confirmed by the --version signature).
 */
export function classifyGoosePath(instance: Pick<BinaryInstance, "path" | "realPath">, host: Host = getHost()): "goose" | "other" | "check" {
  if (fromBrewToken(instance, "block-goose-cli", host)) return "goose";
  if (fromBrewToken(instance, "goose", host)) return "other";
  const path = pathFor(host.platform);
  const goBins = [envVar(host, "GOBIN"), path.join(envVar(host, "GOPATH") ?? path.join(host.homedir, "go"), "bin")];
  if (goBins.some((dir) => dir && isInside(instance.realPath, dir, host.platform))) return "other";
  const real = normalizePath(instance.realPath, host.platform);
  if (real.includes("/pressly/")) return "other";
  return gooseDirs(host).some((dir) => isInside(instance.path, dir, host.platform) || isInside(instance.realPath, dir, host.platform)) ? "check" : "other";
}

/** Goose's --version output is a bare version; pressly's says "goose version: vX". */
export function isGooseVersionOutput(output: string): boolean {
  return /^\s*v?\d+\.\d+\.\d+\S*\s*$/.test(output) && !/goose version:/i.test(output);
}

export const goose: ToolDescriptor = {
  id: "goose",
  group: "agents",
  name: "Goose",
  description: "Open-source AI agent for the terminal (formerly block/goose)",
  docsUrl: "https://goose-docs.ai/docs/getting-started/installation/",
  binNames: ["goose"],

  async identify(instance) {
    const verdict = classifyGoosePath(instance);
    if (verdict !== "check") return verdict === "goose";
    const res = await exec(instance.path, ["--version"], 3_000);
    return res.ok && isGooseVersionOutput(res.stdout);
  },

  refineInstallMethod: (method) => (method === "unknown" ? "native" : method),
  getInstalledVersion: (instance) => versionFromCommand(instance.path),
  getLatestVersion: () => fetchLatestGithubRelease(REPO),
  latestCacheTtlMs: GITHUB_CACHE_TTL_MS,

  async getUpdatePlan(instance): Promise<UpdatePlan> {
    if (instance.installMethod === "brew") {
      return { kind: "manual", command: "brew upgrade block-goose-cli", reason: "Installed with Homebrew; `goose update` doesn't know about brew, so let brew upgrade it." };
    }
    if (classifyGoosePath(instance) === "check") return { kind: "auto", command: [instance.path, "update"] }; // documented self-updater
    return { kind: "manual", command: "goose update", reason: "Install location not recognized; run Goose's own updater where it is installed." };
  },
};