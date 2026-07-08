import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSION_RESOLVER,
  type IPermissionResolver,
} from '../../../domain/ports/permission-resolver.port';
import { TenantContextService } from '../../../../../shared/tenant-context/tenant-context.service';
import { AUTHENTICATED_ONLY } from '../decorators/authenticated-only.decorator';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { REQUIRED_PERMISSIONS } from '../decorators/require-permissions.decorator';

/**
 * Deny-by-default authorization (TONG-QUAN.md §20): a route must be @Public,
 * @AuthenticatedOnly, or carry @RequirePermissions — anything else is a 403.
 *
 * Scope headers (x-tenant-id / x-partner-id) only NAME the scope the client
 * wants to act in; the permission lookup verifies the user actually holds a
 * role assignment there, then seeds the tenant context for RLS. A tenant_id
 * is never trusted from the client for data access — RLS runs on the
 * assignment-verified value.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PERMISSION_RESOLVER) private readonly resolver: IPermissionResolver,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_ONLY, targets)) return true;

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, targets);
    if (!required || required.length === 0) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'NO_PERMISSION_DECLARED',
        message: 'Route declares no permissions and is denied by default',
      });
    }

    const req = context.switchToHttp().getRequest();
    const tenantId: string | undefined = req.headers['x-tenant-id'];
    const partnerId: string | undefined = req.headers['x-partner-id'];
    const held = await this.resolver.resolve(req.principal.userId, { tenantId, partnerId });

    const missing = required.filter((key) => !held.has(key));
    if (missing.length > 0) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MISSING_PERMISSION',
        message: `Missing permission: ${missing.join(', ')}`,
      });
    }

    if (tenantId) this.tenantContext.setTenantId(tenantId);
    if (partnerId) this.tenantContext.setPartnerId(partnerId);
    return true;
  }
}
