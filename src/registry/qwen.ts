import { getHost } from "../utils/host";
import { normalizePath } from "../utils/paths";
import { createNpmPackageTool } from "./npm-package-tool";
import { brewPlan } from "./shared";
import { githubRelease } from "../whatsnew/sources";

// github.com/QwenLM/qwen-code README + docs/users/configuration/settings.md
// (`qwen update`). Latest from npm: GitHub's releases/latest is an SDK tag.
export const qwen = createNpmPackageTool({
  id: "qwen",
  group: "agents",
  name: "Qwen Code",
  shortName: "Qwen",
  description: "Alibaba's Qwen Code agent for the terminal",
  docsUrl: "https://github.com/QwenLM/qwen-code",
  releaseNotes: githubRelease("QwenLM/qwen-code"),
  binNames: ["qwen"],
  pkg: "@qwen-code/qwen-code",
  // Standalone installer: ~/.local/bin/qwen -> ~/.local/lib/qwen-code, or %LOCALAPPDATA%/qwen-code/bin.
  refineInstallMethod: (method, instance) =>
    method === "unknown" && normalizePath(instance.realPath, getHost().platform).includes("/qwen-code/") ? "native" : method,
  otherPlan: (instance) => {
    if (instance.installMethod === "native") return { kind: "auto", command: [instance.path, "update"] };
    if (instance.installMethod === "brew") return brewPlan("qwen-code");
    return null;
  },
});