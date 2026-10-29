import { fromBrewToken } from "./detect-helpers";
import { createPythonPackageTool, pythonInstallOf } from "./python-package-tool";
import { brewPlan } from "./shared";
import { githubRelease } from "../whatsnew/sources";

// docs.mistral.ai/vibe/code/cli/install-setup: the install script installs uv
// if needed and runs `uv tool install mistral-vibe` (bins vibe, vibe-acp,
// vibe-app-server; Python >= 3.12); pip and Homebrew (`mistral-vibe`) work too.
// `vibe` is a generic name: only claim it inside the mistral-vibe package.
const PYPI = "mistral-vibe";

export const vibe = createPythonPackageTool({
  id: "vibe",
  group: "agents",
  name: "Mistral Vibe",
  shortName: "Vibe",
  binNames: ["vibe"],
  pypi: PYPI,
  description: "Mistral's coding agent for the terminal",
  docsUrl: "https://docs.mistral.ai/vibe/code/cli/install-setup",
  releaseNotes: githubRelease("mistralai/mistral-vibe"),
  identify: (instance) => pythonInstallOf(instance, PYPI) !== null || fromBrewToken(instance, PYPI),
  otherPlan: (instance) => (instance.installMethod === "brew" ? brewPlan(PYPI) : null),
});