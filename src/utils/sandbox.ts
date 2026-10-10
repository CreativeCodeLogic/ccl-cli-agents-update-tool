/**
 * Process-wide kill switch for side effects. Once blocked (demo mode), the
 * low-level helpers that spawn processes, hit the network or write the cache
 * refuse to act, so nothing real can run even if a code path is reached by
 * mistake. There is deliberately no way to unblock within a process.
 */
let blockedReason: string | null = null;

export function blockSideEffects(reason: string): void {
  blockedReason ??= reason;
}

/** Why side effects are blocked, or null when they are allowed. */
export function sideEffectsBlocked(): string | null {
  return blockedReason;
}