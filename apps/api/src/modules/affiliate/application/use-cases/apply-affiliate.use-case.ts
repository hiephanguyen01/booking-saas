import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ApplyAffiliateInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../../tenancy/domain/ports/tenant-repository.port';
import {
  AFFILIATE_REPOSITORY,
  type AffiliateRecord,
  type IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';

export interface AppliedAffiliate {
  affiliate: AffiliateRecord;
  tenantName: string;
}

/**
 * A logged-in user applies to become an affiliate for a tenant (§15.1 self-signup,
 * tenant approves). Starts `pending`. Re-applying returns the existing membership
 * (idempotent) so the storefront form is safe to resubmit. This route has no
 * tenant context — the tenant is taken from the (BFF-resolved) body and validated.
 */
@Injectable()
export class ApplyAffiliateUseCase {
  constructor(
    @Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: ITenantRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(userId: string, input: ApplyAffiliateInput): Promise<AppliedAffiliate> {
    const tenant = await this.tenants.findById(input.tenantId);
    if (!tenant) {
      throw new NotFoundException({ statusCode: 404, code: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
    }
    if (tenant.status !== 'active') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'TENANT_INACTIVE',
        message: 'Tenant is not accepting affiliate applications',
      });
    }

    const affiliate = await this.tenantDb.forTenant(input.tenantId, async (tx) => {
      const existing = await this.affiliates.findByUser(tx, userId);
      if (existing) return existing;
      const created = await this.affiliates.create(tx, input.tenantId, {
        userId,
        payoutInfo: input.payoutInfo,
      });
      await this.outbox.emit(tx, {
        tenantId: input.tenantId,
        eventType: 'affiliate.applied',
        payload: { affiliateId: created.id, userId },
      });
      return created;
    });
    return { affiliate, tenantName: tenant.name };
  }
}
