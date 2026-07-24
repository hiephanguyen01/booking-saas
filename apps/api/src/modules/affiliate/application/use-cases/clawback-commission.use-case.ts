import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { AffiliateCommission } from '../../domain/entities/affiliate-commission.entity';
import {
  AFFILIATE_COMMISSION_REPOSITORY,
  type IAffiliateCommissionRepository,
} from '../../domain/ports/affiliate-commission-repository.port';

/**
 * Post-completion dispute (booking.refunded) → claw back a confirmed/paid
 * commission (§7.8). Idempotent (the row is keyed by the unique `booking_id`)
 * and opens its own `forTenant` tx — outbox handlers carry no request context.
 */
@Injectable()
export class ClawbackCommissionUseCase {
  constructor(
    @Inject(AFFILIATE_COMMISSION_REPOSITORY) private readonly commissions: IAffiliateCommissionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.commissions.loadByBooking(tx, bookingId);
      if (!existing) return;
      if (!AffiliateCommission.rehydrate(existing).clawback()) return;
      await this.commissions.updateForBooking(tx, bookingId, {
        status: 'clawed_back',
      });
    });
  }
}
