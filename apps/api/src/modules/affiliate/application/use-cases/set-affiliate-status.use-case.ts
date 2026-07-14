import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  AFFILIATE_REPOSITORY,
  type AffiliateRecord,
  type IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';

/** Tenant approves or suspends an affiliate (§15.1). */
@Injectable()
export class SetAffiliateStatusUseCase {
  constructor(
    @Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    affiliateId: string,
    status: 'approved' | 'suspended',
  ): Promise<AffiliateRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.affiliates.findById(tx, affiliateId);
      if (!existing) {
        throw new NotFoundException({ statusCode: 404, code: 'AFFILIATE_NOT_FOUND', message: 'Affiliate not found' });
      }
      const updated = await this.affiliates.setStatus(tx, affiliateId, status);
      await this.outbox.emit(tx, {
        tenantId,
        eventType: status === 'approved' ? 'affiliate.approved' : 'affiliate.suspended',
        payload: { affiliateId, userId: existing.userId },
      });
      return updated;
    });
  }
}
