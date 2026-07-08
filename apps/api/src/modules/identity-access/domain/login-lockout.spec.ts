import { describe, expect, it } from 'vitest';
import { isLocked, MAX_FAILED_LOGINS, recordFailure, recordSuccess } from './login-lockout';

const now = new Date('2026-07-08T10:00:00Z');

describe('login lockout', () => {
  it('locks after MAX_FAILED_LOGINS consecutive failures', () => {
    let state = { failedLoginCount: 0, lockedUntil: null as Date | null };
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) {
      state = recordFailure(state, now);
      expect(isLocked(state, now)).toBe(false);
    }
    state = recordFailure(state, now);
    expect(isLocked(state, now)).toBe(true);
  });

  it('lockout expires after the window', () => {
    let state = { failedLoginCount: MAX_FAILED_LOGINS - 1, lockedUntil: null as Date | null };
    state = recordFailure(state, now);
    const later = new Date(now.getTime() + 16 * 60_000);
    expect(isLocked(state, later)).toBe(false);
  });

  it('success resets the counter', () => {
    expect(recordSuccess()).toEqual({ failedLoginCount: 0, lockedUntil: null });
  });
});
