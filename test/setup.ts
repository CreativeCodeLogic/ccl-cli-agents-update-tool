import { beforeEach } from "vitest";
import { primeNpmScriptPolicy } from "../src/utils/npm-scripts";

// Never ask the machine's npm about install scripts in tests: its version and the
// user's allow-scripts list would change the commands. npm 10 = no --allow-scripts.
// Tests for npm 12 prime their own policy.
beforeEach(() => {
  primeNpmScriptPolicy({ version: "10.9.0", allowScripts: [], ignoreScripts: false, allowAll: false });
});
