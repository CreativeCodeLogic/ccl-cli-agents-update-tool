import { createPythonPackageTool } from "./python-package-tool";
import { brewPlan } from "./shared";
import { changelogFile } from "../whatsnew/sources";

// aider.chat/docs/install.html: aider-install and the install.sh/ps1 one-liners
// all run `uv tool install --python python3.12 --with pip aider-chat`; pipx and
// pip work too, and Homebrew has an `aider` formula. Latest from PyPI aider-chat.
export const aider = createPythonPackageTool({
  id: "aider",
  group: "agents",
  name: "Aider",
  binNames: ["aider"],
  pypi: "aider-chat",
  description: "AI pair programming in your terminal",
  docsUrl: "https://aider.chat/docs/install.html",
  releaseNotes: changelogFile("https://raw.githubusercontent.com/Aider-AI/aider/main/HISTORY.md", "https://github.com/Aider-AI/aider/blob/main/HISTORY.md", "### Aider v"),
  otherPlan: (instance) => (instance.installMethod === "brew" ? brewPlan("aider") : null),
});