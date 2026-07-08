/**
 * Login lockout policy (TONG-QUAN.md §20): temporary lockout after N failed
 * attempts. Pure domain logic — no framework imports.
 */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export interface LockoutState {
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export function isLocked(state: LockoutState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}

/** State after one more failed attempt. */
export function recordFailure(state: LockoutState, now: Date): LockoutState {
  const failedLoginCount = state.failedLoginCount + 1;
  if (failedLoginCount >= MAX_FAILED_LOGINS) {
    return {
      failedLoginCount: 0,
      lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000),
    };
  }
  return { failedLoginCount, lockedUntil: null };
}

/** State after a successful login. */
export function recordSuccess(): LockoutState {
  return { failedLoginCount: 0, lockedUntil: null };
}
