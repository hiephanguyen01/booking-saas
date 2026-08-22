/**
 * The authenticated caller attached to `req.principal` by `SessionAuthGuard`.
 *
 * Canonical home is `shared/http/`, not `identity-access/domain/`, even though the shape is
 * entirely about auth — `identity-access` already depends on `notification` (its OTP-email
 * adapter, `smtp-auth-email.sender.ts`, injects notification's `EMAIL_SENDER`/`EMAIL_RENDERER`/
 * `NOTIFICATION_READER`), so a module that itself needs `SessionPrincipal` cannot get it from
 * `identity-access` without closing a cycle (the module-cycle guard in `pnpm test`, CI-enforced).
 * AGENTS.md
 * already treats auth as "de-facto framework"; this is that framework status made literal.
 *
 * `identity-access/domain/ports/session-store.port.ts` re-exports this type so its ~41 existing
 * importers keep resolving `SessionPrincipal` from the same path, untouched. Do not delete that
 * re-export or move this back into `identity-access` — either reopens the cycle.
 */
export interface SessionPrincipal {
  sessionId: string;
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  locale: string;
  status: string;
}
