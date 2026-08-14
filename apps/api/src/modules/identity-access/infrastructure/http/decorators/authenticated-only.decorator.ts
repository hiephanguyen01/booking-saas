/**
 * Canonical definitions moved to `shared/http/authenticated-only.decorator.ts` — these are
 * framework decorators, not identity-access domain, and `identity-access` already depends on
 * `notification` (its OTP-email adapter), so keeping them here would close a module cycle the
 * moment another module needs `@AuthenticatedOnly()` — which the notification inbox now does.
 * Re-exported here so every existing importer of this path keeps working untouched. Do not delete
 * this re-export: it is what keeps `pnpm check:module-cycles` green.
 */
export { AUTHENTICATED_ONLY, AuthenticatedOnly } from '../../../../../shared/http/authenticated-only.decorator';
