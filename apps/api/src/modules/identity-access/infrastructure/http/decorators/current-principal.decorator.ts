import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { SessionPrincipal } from '../../../domain/ports/session-store.port';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionPrincipal => {
    return ctx.switchToHttp().getRequest().principal;
  },
);
