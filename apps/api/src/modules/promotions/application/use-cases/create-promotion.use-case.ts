import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import type { CreatePromotionInput } from '@booking/shared';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { vnd } from '../../../../shared/money/money';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { normalizeCode } from '../apply-promotion.service';
import { assertTenantShareRisk } from '../assert-tenant-share-risk';

/** Create a discount code (§12.2). `funded_by` is always `tenant` in Phase 1. */
@Injectable()
export class CreatePromotionUseCase {
  private readonly logger = new Logger(CreatePromotionUseCase.name);

  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, input: CreatePromotionInput): Promise<PromotionRecord> {
    const code = normalizeCode(input.code);
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.promotions.findByCode(tx, code);
      if (existing) {
        throw new ConflictException({ statusCode: 409, code: 'PROMO_CODE_TAKEN', message: `Code "${code}" is already in use` });
      }

      // §12.4: block a tenant-funded discount certain to drive the tenant share negative; warn otherwise.
      // Phase 1 promotions are always tenant-funded.
      await assertTenantShareRisk(
        tx,
        { fundedBy: 'tenant', discountType: input.discountType, discountValue: Number(input.discountValue) },
        this.logger,
      );

      return this.promotions.create(tx, tenantId, {
        name: input.name,
        code,
        discountType: input.discountType,
        discountValue: vnd(input.discountValue),
        maxDiscount: input.maxDiscount !== undefined ? vnd(input.maxDiscount) : null,
        appliesTo: input.appliesTo,
        appliesToId: input.appliesTo === 'listing' ? (input.appliesToId ?? null) : null,
        minOrderAmount: input.minOrderAmount !== undefined ? vnd(input.minOrderAmount) : null,
        usageLimitTotal: input.usageLimitTotal ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        status: input.status,
      });
    });
  }
}
