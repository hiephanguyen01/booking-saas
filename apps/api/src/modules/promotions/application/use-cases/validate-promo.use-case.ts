import { Inject, Injectable } from '@nestjs/common';
import type { ValidatePromoInput, ValidatePromoResponse } from '@booking/shared';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { vnd } from '../../../../shared/money/money';
import { utcNow } from '../../../../shared/time/time';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
} from '../../domain/ports/promotion-repository.port';
import { evaluatePromo } from '../../domain/promotion-discount';
import { normalizeCode } from '../apply-promotion.service';

/**
 * Storefront checkout preview (§12.3): validate a code against a slot subtotal.
 * Read-only — no usage is claimed. Invalid codes return `{ valid: false, error }`
 * with a stable i18n code rather than an HTTP error, so the checkout form can
 * message the customer inline.
 */
@Injectable()
export class ValidatePromoUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, input: ValidatePromoInput): Promise<ValidatePromoResponse> {
    const tenant = await this.resolveTenant.execute(host);
    const code = normalizeCode(input.code);
    const amount = vnd(input.amount);

    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const promo = await this.promotions.findByCode(tx, code);
      if (!promo) {
        return { valid: false, discountAmount: '0', finalAmount: amount.toString(), code, error: 'PROMO_NOT_FOUND' };
      }
      const evaluation = evaluatePromo(promo, { listingId: input.listingId, amount, now: utcNow() });
      if (!evaluation.ok) {
        return { valid: false, discountAmount: '0', finalAmount: amount.toString(), code, error: evaluation.rejection };
      }
      return {
        valid: true,
        discountAmount: evaluation.discountAmount.toString(),
        finalAmount: evaluation.finalAmount.toString(),
        code,
      };
    });
  }
}
