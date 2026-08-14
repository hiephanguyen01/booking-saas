/**
 * Canonical definition moved to `shared/http/current-principal.decorator.ts` — see
 * `authenticated-only.decorator.ts` in this folder for why. Re-exported here so every existing
 * importer of this path keeps working untouched. Do not delete this re-export: it is what keeps
 * `pnpm check:module-cycles` green.
 */
export { CurrentPrincipal } from '../../../../../shared/http/current-principal.decorator';
