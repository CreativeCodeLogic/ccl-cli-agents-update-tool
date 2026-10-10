import { getHost } from "../utils/host";
import { createNpmPackageTool } from "./npm-package-tool";

function standaloneCommand(): string {
  return getHost().platform === "win32"
    ? "Download the latest firebase-tools-instant-win.exe from https://firebase.tools"
    : "curl -sL https://firebase.tools | upgrade=true bash";
}

export const firebase = createNpmPackageTool({
  id: "firebase",
  name: "Firebase CLI",
  shortName: "Firebase",
  binNames: ["firebase"],
  pkg: "firebase-tools",
  // Anything not under npm is almost certainly the standalone binary.
  refineInstallMethod: (method) => (method === "unknown" ? "native" : method),
  otherPlan: (instance) =>
    instance.installMethod === "native"
      ? {
          kind: "manual",
          command: standaloneCommand(),
          reason: "Standalone Firebase binary; it is replaced by re-running the installer.",
        }
      : null,
});
