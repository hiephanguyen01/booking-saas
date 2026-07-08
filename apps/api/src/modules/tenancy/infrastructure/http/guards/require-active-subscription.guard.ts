import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../../../shared/tenant-context/tenant-context.service';
import { evaluateSubscription } from '../../../domain/subscription-status';
import {
  SUBSCRIPTION_REPOSITORY,
  type ISubscriptionRepository,
} from '../../../domain/ports/subscription-repository.port';

/**
 * Makes the dashboard read-only once a subscription lapses (§6.5). Apply to
 * tenant write routes with `@UseGuards(RequireActiveSubscriptionGuard)`; runs
 * after PermissionsGuard has seeded the tenant context.
 */
@Injectable()
export class RequireActiveSubscriptionGuard implements CanActivate {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subscriptions: ISubscriptionRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const sub = await this.subscriptions.findCurrentByTenant(tenantId);
    if (!evaluateSubscription(sub, new Date()).dashboardWritable) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Subscription has expired — the dashboard is read-only',
      });
    }
    return true;
  }
}
