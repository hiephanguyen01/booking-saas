export const INVITATION_TOKEN = Symbol('INVITATION_TOKEN');

/**
 * Opaque invitation token, same convention as sessions (ADR 0001): only the
 * hash is ever persisted, the clear token exists only long enough to be
 * mailed.
 */
export interface IInvitationToken {
  /** Returns the clear token (mailed) and its hash (stored) — never store the clear one. */
  issue(): { token: string; tokenHash: string };
  hash(token: string): string;
}
