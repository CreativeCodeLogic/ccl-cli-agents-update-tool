import pc from "./colors";

/**
 * The one color system, used on every surface (table, checklist, progress, summary):
 * - done (green):    done, up-to-date, success
 * - action (amber):  needs action: update available, SELECTED for update, needs admin
 * - self (cyan):     updates itself
 * - bad (red):       retired, failed
 * - muted (dim):     not selected, not installed, secondary information
 * Bold marks focus (the checklist row under the cursor).
 */
export const tone = {
  done: pc.green,
  action: pc.yellow,
  self: pc.cyan,
  bad: pc.red,
  muted: pc.dim,
  focus: pc.bold,
} as const;