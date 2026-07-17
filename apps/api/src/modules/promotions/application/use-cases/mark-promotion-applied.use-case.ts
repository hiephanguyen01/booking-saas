import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMO_REDEMPTION_REPOSITORY,
  type IPromoRedemptionRepository,
} from '../../domain/ports/promo-redemption-repository.port';

/**
 * booking.confirmed → redemption `reserved → applied` (idempotent). Driven by an
 * outbox event, so it opens its own transaction (§12.3 lifecycle transition).
 */
@Injectable()
export class MarkPromotionAppliedUseCase {
  constructor(
    @Inject(PROMO_REDEMPTION_REPOSITORY) private readonly redemptions: IPromoRedemptionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, bookingId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, (tx) => this.redemptions.markApplied(tx, bookingId));
  }
}
