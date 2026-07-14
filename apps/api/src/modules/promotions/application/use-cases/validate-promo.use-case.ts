import { Inject, Injectable } from '@nestjs/common';
import type { ValidatePromoInput, ValidatePromoResponse } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { vnd } from '../../../../shared/money/money';
import { utcNow } from '../../../../shared/time/time';
import { ResolveTenantByHostUseCase } from '../../../tenancy/application/use-cases/resolve-tenant-by-host.use-case';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
} from '../../domain/ports/promotion-repository.port';
import {
  PROMO_CONTEXT_LOOKUP,
  type IPromoContextLookup,
} from '../../domain/ports/promo-context-lookup.port';
import { evaluatePromo } from '../../domain/promotion-discount';
import { normalizeCode } from '../apply-promotion.service';

/**
 * Storefront checkout preview (§12.3): validate a code against a slot subtotal.
 * Read-only — no usage is claimed. Invalid codes return `{ valid: false, error }`
 * with a stable i18n code rather than an HTTP error, so the checkout form can
 * message the customer inline. First-booking-only / per-customer limits are NOT
 * checked here (no customer identity) — they are enforced authoritatively at
 * booking creation; the preview stays best-effort on scope/window/min/limit.
 */
@Injectable()
export class ValidatePromoUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    @Inject(PROMO_CONTEXT_LOOKUP) private readonly lookup: IPromoContextLookup,
    private readonly resolveTenant: ResolveTenantByHostUseCase,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(host: string, input: ValidatePromoInput): Promise<ValidatePromoResponse> {
    const tenant = await this.resolveTenant.execute(host);
    const code = normalizeCode(input.code);
    const amount = vnd(input.amount);
    const invalid = (error: ValidatePromoResponse['error']): ValidatePromoResponse => ({
      valid: false,
      discountAmount: '0',
      finalAmount: amount.toString(),
      code,
      error,
    });

    return this.tenantDb.forTenant(tenant.id, async (tx) => {
      const scope = await this.lookup.getListingScope(tx, input.listingId);
      if (!scope) return invalid('PROMO_NOT_APPLICABLE');
      const promo = await this.promotions.findByCode(tx, code);
      if (!promo || promo.code === null) return invalid('PROMO_NOT_FOUND');

      const evaluation = evaluatePromo(promo, {
        listingId: scope.listingId,
        listingTypeId: scope.listingTypeId,
        groupId: scope.groupId,
        categoryId: scope.categoryId,
        partnerId: scope.partnerId,
        amount,
        now: utcNow(),
        slotStart: input.start ? new Date(input.start) : null,
        timezone: scope.timezone,
      });
      if (!evaluation.ok) return invalid(evaluation.rejection);
      return {
        valid: true,
        discountAmount: evaluation.discountAmount.toString(),
        finalAmount: evaluation.finalAmount.toString(),
        code,
      };
    });
  }
}
