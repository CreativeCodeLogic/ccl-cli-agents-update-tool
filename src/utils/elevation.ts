import { exec } from "./exec";

/**
 * Does ccl-caut run with administrator rights? Windows: `net session` only
 * succeeds elevated. POSIX: uid 0. Fails safe to false; never elevates.
 */
export async function detectElevation(platform: NodeJS.Platform = process.platform): Promise<boolean> {
  if (platform !== "win32") return typeof process.getuid === "function" && process.getuid() === 0;
  const result = await exec("net", ["session"], 2_000);
  return result.ok;
}