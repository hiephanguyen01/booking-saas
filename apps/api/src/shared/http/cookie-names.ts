/**
 * Name of the opaque access-session cookie (`ADR 0001` — sessions, not JWT).
 *
 * Canonical home is `shared/http/`: `AuthenticatedOnly` (also `shared/http/`) needs it to document
 * `ApiCookieAuth`, and `shared/` must never import from `modules/`. Cookie WRITING
 * (`setSessionCookies`/`clearSessionCookies`) stays in
 * `identity-access/infrastructure/http/cookies.ts` — that needs `SessionTokens`, a real
 * identity-access domain type, so it has no reason to move. That file re-exports this constant so
 * its existing importers of `ACCESS_COOKIE` keep resolving it from the same path, untouched.
 */
export const ACCESS_COOKIE = 'sid';
