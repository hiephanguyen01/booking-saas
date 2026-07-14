import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { SessionPrincipal } from '../../../domain/ports/session-store.port';

/**
 * The calling principal on a `@Public()` route, or `undefined` for an anonymous
 * caller. `SessionAuthGuard` attaches it best-effort from the access cookie, so
 * public handlers can attribute an action to a logged-in user without decoding
 * the session themselves.
 */
export const OptionalPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionPrincipal | undefined => {
    return ctx.switchToHttp().getRequest().principal ?? undefined;
  },
);
