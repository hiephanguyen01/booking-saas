import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { SessionPrincipal } from './session-principal';

/**
 * Canonical home for `@CurrentPrincipal()` — see `session-principal.ts` for why this lives in
 * `shared/http/` rather than `identity-access`. `identity-access/infrastructure/http/decorators/
 * current-principal.decorator.ts` re-exports this so its existing importers keep working
 * untouched; do not delete that re-export, it is what keeps the module graph acyclic.
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionPrincipal => {
    return ctx.switchToHttp().getRequest().principal;
  },
);
