import spawn from "cross-spawn";

export interface ExecResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

const FAILED: ExecResult = { ok: false, code: null, stdout: "", stderr: "" };

/**
 * Run a command and capture its output. Never throws: spawn errors,
 * non-zero exits and timeouts all resolve with ok=false.
 * cross-spawn handles Windows .cmd/.bat shims without shell:true.
 */
export function exec(command: string, args: string[], timeoutMs = 10_000): Promise<ExecResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ExecResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" },
      });
    } catch {
      resolve(FAILED);
      return;
    }

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));

    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, code: null, stdout, stderr });
    }, timeoutMs);

    child.on("error", () => finish({ ok: false, code: null, stdout, stderr }));
    child.on("close", (code) => finish({ ok: code === 0, code, stdout, stderr }));
  });
}

/** Run a command with the terminal attached (live output). Resolves with the exit code. */
export function execInteractive(command: string, args: string[]): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { stdio: "inherit" });
      child.on("error", () => resolve(null));
      child.on("close", (code) => resolve(code));
    } catch {
      resolve(null);
    }
  });
}
