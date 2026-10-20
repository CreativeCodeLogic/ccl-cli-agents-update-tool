import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkLog, extractSnippet, localize, parseCron, parsePlist } from "../scripts/scheduling-recipe.mjs";

const doc = readFileSync(new URL("../docs/scheduling.md", import.meta.url), "utf8");

describe("docs/scheduling.md recipes (CI runs the cron and launchd ones for real)", () => {
  it("cron: weekly, check only, absolute paths, appends date, output and exit code to a log", () => {
    const cron = parseCron(extractSnippet(doc, "cron"));
    expect(cron.schedule).toBe("0 9 * * 1");
    expect(cron.command).toMatch(/^\{ date; \/home\/you\/\S+\/bin\/node \/home\/you\/\S+\/ccl-caut\/dist\/index\.js --check; echo "exit \$\?"; \} >> \/home\/you\/\S+\.log 2>&1$/);
    expect(cron.command).not.toContain("~");
    expect(cron.command).not.toContain("%"); // cron treats % as a newline
    expect(cron.path).toMatch(/\/usr\/bin:\/bin$/);
  });

  it("launchd: a LaunchAgent with StartCalendarInterval, working directory, PATH and a log", () => {
    const plist = extractSnippet(doc, "plist");
    expect(plist).toContain("<key>StartCalendarInterval</key>");
    expect(plist).toMatch(/<key>Weekday<\/key>\s*<integer>1<\/integer>/);
    expect(plist).toMatch(/<key>WorkingDirectory<\/key>\s*<string>\/Users\/you<\/string>/);
    expect(plist).toContain("<string>/Users/you/Library/Logs/ccl-caut.log</string>");
    const { command, path } = parsePlist(plist);
    expect(command).toContain("/ccl-caut/dist/index.js\" --check");
    expect(path).toMatch(/\/usr\/bin:\/bin$/);
  });

  it("Task Scheduler: current user, never elevated, home folder, log file; schtasks variant too", () => {
    const ps = extractSnippet(doc, "powershell");
    expect(ps).toContain("-RunLevel Limited");
    expect(ps).toContain("-LogonType Interactive");
    expect(ps).toContain("-WorkingDirectory $env:USERPROFILE");
    expect(ps).toContain("Register-ScheduledTask");
    expect(ps).toContain("--check");
    expect(ps).toContain("fnm_multishells");
    const schtasks = extractSnippet(doc, "schtasks");
    expect(schtasks).toMatch(/^schtasks \/Create .*\/SC WEEKLY .*--check >> /);
    expect(schtasks).not.toMatch(/\/RL HIGHEST/i);
  });

  it("localize swaps the example paths for this machine's", () => {
    const where = { prefix: "/opt/node", home: "/root2" };
    expect(localize("/home/you/.nvm/versions/node/v22.19.0/bin/node /home/you/x", where)).toBe("/opt/node/bin/node /root2/x");
    expect(localize("/Users/you/.nvm/versions/node/v22.19.0/lib /Users/you/Library", where)).toBe("/opt/node/lib /root2/Library");
  });
});

describe("checkLog", () => {
  const block = (code: number) => `Mon Oct 20 09:00:01 UTC 2026\n◇  Found 3 of 23 supported CLIs\nexit ${code}\n`;
  it("accepts plain blocks that exited 0 or 1", () => {
    expect(checkLog(block(1) + block(0), 2)).toEqual([]);
  });
  it("flags escape codes, missing runs and other exit codes", () => {
    expect(checkLog(`${String.fromCharCode(27)}[32m${block(0)}`, 1)).toContain("the log contains escape codes");
    expect(checkLog(block(0), 2).length).toBeGreaterThan(0);
    expect(checkLog(block(2), 1)).toContain("unexpected exit codes: 2");
  });
});