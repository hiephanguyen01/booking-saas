import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_STORE, type ISessionStore } from '../../../domain/ports/session-store.port';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { ACCESS_COOKIE } from '../cookies';

/**
 * Global authentication guard: resolves the session cookie into a principal
 * on every non-@Public route. Authorization happens in PermissionsGuard.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SESSION_STORE) private readonly sessions: ISessionStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest();
    // Public routes may still want to know *who* is calling (e.g. attributing a
    // storefront booking to a logged-in customer). Best-effort: attach the
    // principal when a valid cookie is present, but never block the request.
    if (isPublic) {
      const token: string | undefined = req.cookies?.[ACCESS_COOKIE];
      if (token) {
        const principal = await this.sessions.findByAccessToken(token);
        if (principal && principal.status === 'active') req.principal = principal;
      }
      return true;
    }

    const token: string | undefined = req.cookies?.[ACCESS_COOKIE];
    if (!token) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'NOT_AUTHENTICATED',
        message: 'Authentication required',
      });
    }
    const principal = await this.sessions.findByAccessToken(token);
    if (!principal || principal.status !== 'active') {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'SESSION_EXPIRED',
        message: 'Session is invalid or expired',
      });
    }
    req.principal = principal;
    return true;
  }
}
