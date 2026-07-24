import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../../../shared/tenant-context/tenant-context.service';
import { evaluateSubscription } from '../../../domain/subscription-status';
import { SubscriptionExpired } from '../../../domain/errors/billing-errors';
import {
  CURRENT_SUBSCRIPTION_READER,
  type ICurrentSubscriptionReader,
} from '../../../domain/ports/current-subscription-reader.port';

/**
 * Makes the dashboard read-only once a subscription lapses (§6.5). Apply to
 * tenant write routes with `@UseGuards(RequireActiveSubscriptionGuard)`; runs
 * after PermissionsGuard has seeded the tenant context.
 */
@Injectable()
export class RequireActiveSubscriptionGuard implements CanActivate {
  constructor(
    @Inject(CURRENT_SUBSCRIPTION_READER)
    private readonly currentSubscriptions: ICurrentSubscriptionReader,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    const tenantId = this.tenantContext.tenantIdOrThrow();
    const selection = await this.currentSubscriptions.findByTenant(tenantId);
    if (
      !evaluateSubscription(
        selection.current?.subscription ?? null,
        selection.evaluatedAt,
      ).dashboardWritable
    ) {
      throw new SubscriptionExpired();
    }
    return true;
  }
}
