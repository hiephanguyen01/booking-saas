import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { ACCESS_COOKIE } from './cookie-names';

export const AUTHENTICATED_ONLY = 'authenticatedOnly';

/**
 * Routes that need a logged-in user but no specific permission (me, logout, and the notification
 * inbox). Canonical home is `shared/http/` — see `session-principal.ts` for why this moved out of
 * `identity-access`. `PermissionsGuard` reads this exact metadata key
 * (`permissions.guard.ts:35`), so the string `'authenticatedOnly'` must never change.
 * `identity-access/infrastructure/http/decorators/authenticated-only.decorator.ts` re-exports both
 * symbols so its existing importers keep working untouched; do not delete that re-export, it is
 * what keeps the module-cycle guard green.
 */
export const AuthenticatedOnly = () =>
  applyDecorators(
    SetMetadata(AUTHENTICATED_ONLY, true),
    ApiCookieAuth(ACCESS_COOKIE),
    ApiBearerAuth(),
  );
