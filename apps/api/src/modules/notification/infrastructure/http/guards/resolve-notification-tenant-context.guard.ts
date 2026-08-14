import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../../../shared/tenant-context/tenant-context.service';
import type { SessionPrincipal } from '../../../../../shared/http/session-principal';
import {
  NOTIFICATION_READER,
  type INotificationReader,
} from '../../../domain/ports/notification-reader.port';

/**
 * Seeds `TenantContextService` for the notification endpoints.
 *
 * `NotificationController` is entirely `@AuthenticatedOnly()` — reading your own
 * inbox needs no permission key. But `PermissionsGuard` RETURNS AT ITS
 * `AUTHENTICATED_ONLY` BRANCH (permissions.guard.ts:35) and never reaches the
 * `setTenantId` on line 52, so without this guard the store is empty and
 * `tenantIdOrThrow()` throws a 500. `ResolveAffiliateTenantContextGuard`
 * documents the same trap for the same reason.
 *
 * The header is verified, never trusted: a caller with no membership in the
 * named tenant is refused rather than having RLS seeded from their claim. This
 * is defence in depth — every repository statement is ALSO bounded by
 * `user_id = $me`, so a forged header would return an empty set anyway. Both
 * hold; neither may be dropped because the other exists.
 */
@Injectable()
export class ResolveNotificationTenantContextGuard implements CanActivate {
  constructor(
    @Inject(NOTIFICATION_READER) private readonly reader: INotificationReader,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    // SessionAuthGuard already denied an unauthenticated caller before this runs.
    const principal: SessionPrincipal | undefined = req.principal;
    if (!principal) return true;

    const tenantId: string | undefined = req.headers['x-tenant-id'];
    if (!tenantId) throw new ForbiddenException('Thiếu ngữ cảnh tenant.');
    if (!(await this.reader.hasTenantMembership(principal.userId, tenantId))) {
      throw new ForbiddenException('Tài khoản không thuộc tenant này.');
    }
    this.tenantContext.setTenantId(tenantId);
    return true;
  }
}
