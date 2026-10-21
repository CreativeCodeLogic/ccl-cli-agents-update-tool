/**
 * The pre-flight question. "Ready to update?" is asked once per update round;
 * after Re-check the follow-up says what the check found instead of repeating
 * the same question (a repeated identical prompt read as a bug).
 */
export function preflightQuestion(check: number, stillRunning: readonly string[]): string {
  if (check === 0) return "Ready to update?";
  if (stillRunning.length === 0) return "Checked again: none of them is running now. Update now?";
  const names = stillRunning.length <= 2 ? stillRunning.join(" and ") : `${stillRunning.slice(0, -1).join(", ")} and ${stillRunning.at(-1)}`;
  return `Checked again: ${names} ${stillRunning.length === 1 ? "is" : "are"} still running. Update anyway?`;
}