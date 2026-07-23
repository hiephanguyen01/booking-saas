import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { utcNow } from '../../../../shared/time/time';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { Promotion } from '../../domain/entities/promotion.entity';
import { PromotionNotFound } from '../../domain/errors/promotion-errors';
import {
  AGREEMENT_REPOSITORY,
  type IAgreementRepository,
} from '../../../partner/domain/ports/agreement-repository.port';

/**
 * The funding partner opts in to a tenant-created partner-funded promotion (§12.2)
 * — a tenant cannot unilaterally cut into a partner's revenue. Sets the gate
 * (`partner_opt_in_at`) and records proof in `agreement_acceptances` (promo_funding).
 */
@Injectable()
export class OptInPromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    @Inject(AGREEMENT_REPOSITORY) private readonly agreements: IAgreementRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    partnerId: string,
    id: string,
    actor: { userId: string; ip?: string | null },
  ): Promise<PromotionRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const promo = await this.promotions.findById(tx, id);
      if (!promo) {
        throw new PromotionNotFound();
      }
      const promotion = Promotion.rehydrate(promo);
      promotion.assertCanOptIn(partnerId);
      const updated = await this.promotions.setPartnerOptIn(tx, id, utcNow());
      await this.agreements.record(tx, {
        tenantId,
        partnerId,
        userId: actor.userId,
        agreementType: 'promo_funding',
        version: promo.id, // ties the acceptance to this specific promotion
        ip: actor.ip ?? null,
      });
      return updated;
    });
  }
}
