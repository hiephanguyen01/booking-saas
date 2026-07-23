import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import {
  Affiliate,
  type AffiliateState,
} from '../../domain/entities/affiliate.entity';
import { AffiliateNotFound } from '../../domain/errors/affiliate-errors';
import {
  AFFILIATE_REPOSITORY,
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
  ): Promise<AffiliateState> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.affiliates.loadById(tx, affiliateId);
      if (!existing) throw new AffiliateNotFound();
      const intent = Affiliate.rehydrate(existing).setStatus(status);
      const updated = await this.affiliates.setStatus(
        tx,
        affiliateId,
        intent,
      );
      await this.outbox.emit(tx, {
        tenantId,
        eventType: intent.eventType,
        payload: { affiliateId, userId: existing.userId },
      });
      return updated;
    });
  }
}
