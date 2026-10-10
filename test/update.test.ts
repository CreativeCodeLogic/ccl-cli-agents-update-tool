import { afterEach, describe, expect, it } from "vitest";
import { diagnose, displayCommand } from "../src/ui/update";
import { setHost } from "../src/utils/host";
import { primeNpmGlobalPaths } from "../src/utils/npm";
import { fakeHost, win } from "./helpers";

let restore: () => void = () => {};
afterEach(() => restore());

function useWindows(npmPrefix: string): void {
  restore = setHost(
    fakeHost({ platform: "win32", homedir: win("C:/Users/Jane"), env: { ProgramFiles: win("C:/Program Files") } }),
  );
  primeNpmGlobalPaths({ prefix: npmPrefix, root: win(`${npmPrefix}/node_modules`) });
}

describe("diagnose", () => {
  const npmInstall = ["npm", "install", "-g", "@openai/codex@latest"];

  it.each([
    "npm error code EBUSY",
    "EPERM: operation not permitted, rename 'codex.exe'",
    "The process cannot access the file because it is being used by another process.",
  ])("explains a locked file: %s", async (output) => {
    useWindows(win("C:/Users/Jane/AppData/Roaming/npm"));
    expect(await diagnose(output, "Codex CLI", npmInstall)).toContain("Codex CLI appears to be running");
  });

  it("asks for an elevated terminal when npm's prefix is under Program Files", async () => {
    useWindows(win("C:/Program Files/nodejs"));
    expect(await diagnose("npm error code EPERM", "Codex CLI", npmInstall)).toContain("Run as administrator");
    expect(await diagnose("npm error code EACCES", "Codex CLI", npmInstall)).toContain("Run as administrator");
  });

  it("suggests fixing the npm prefix on POSIX permission errors", async () => {
    restore = setHost(fakeHost({ platform: "linux", homedir: "/home/jane" }));
    primeNpmGlobalPaths({ prefix: "/usr", root: "/usr/lib/node_modules" });
    expect(await diagnose("npm error code EACCES", "Codex CLI", npmInstall)).toContain("Avoid sudo npm");
  });

  it("only blames npm permissions for npm commands, and stays quiet on unrelated errors", async () => {
    useWindows(win("C:/Program Files/nodejs"));
    expect(await diagnose("EACCES", "Kimi Code", ["/home/jane/.kimi-code/bin/kimi", "upgrade"])).toBeNull();
    expect(await diagnose("network timeout", "Codex CLI", npmInstall)).toBeNull();
  });
});

describe("displayCommand", () => {
  it("shows self-updaters by name, not by absolute path", () => {
    expect(displayCommand(["/home/jane/.kimi-code/bin/kimi", "upgrade"])).toBe("kimi upgrade");
    expect(displayCommand(["npm", "install", "-g", "x@latest"])).toBe("npm install -g x@latest");
  });
});