export function classifyTag(
  tag: string,
  options?: { isPrivate?: boolean },
): { channel: "stable" | "rc" | "beta"; version: string; publishToNpm: boolean; npmSkipped?: "private" } | null;