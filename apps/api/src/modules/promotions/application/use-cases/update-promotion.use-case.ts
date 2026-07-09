import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { UpdatePromotionInput } from '@booking/shared';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { vnd } from '../../../../shared/money/money';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
  type UpdatePromotionData,
} from '../../domain/ports/promotion-repository.port';
import { normalizeCode } from '../apply-promotion.service';
import { assertTenantShareRisk } from '../assert-tenant-share-risk';

/** Edit a discount code (§12.2). Historic bookings keep their immutable snapshot. */
@Injectable()
export class UpdatePromotionUseCase {
  private readonly logger = new Logger(UpdatePromotionUseCase.name);

  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string, input: UpdatePromotionInput): Promise<PromotionRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.promotions.findById(tx, id);
      if (!existing) {
        throw new NotFoundException({ statusCode: 404, code: 'PROMO_NOT_FOUND', message: 'Promotion not found' });
      }
      if (existing.status === 'ended') {
        throw new ConflictException({ statusCode: 409, code: 'PROMO_ENDED', message: 'An ended promotion cannot be edited' });
      }

      // §12.4: re-check the tenant-share risk against the merged discount details.
      await assertTenantShareRisk(
        tx,
        {
          fundedBy: existing.fundedBy,
          discountType: input.discountType ?? existing.discountType,
          discountValue: input.discountValue !== undefined ? Number(input.discountValue) : Number(existing.discountValue),
        },
        this.logger,
      );

      const data: UpdatePromotionData = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.discountType !== undefined) data.discountType = input.discountType;
      if (input.discountValue !== undefined) data.discountValue = vnd(input.discountValue);
      if (input.maxDiscount !== undefined) data.maxDiscount = vnd(input.maxDiscount);
      if (input.minOrderAmount !== undefined) data.minOrderAmount = vnd(input.minOrderAmount);
      if (input.usageLimitTotal !== undefined) data.usageLimitTotal = input.usageLimitTotal;
      if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt);
      if (input.endsAt !== undefined) data.endsAt = new Date(input.endsAt);
      if (input.status !== undefined) data.status = input.status;
      if (input.appliesTo !== undefined) {
        data.appliesTo = input.appliesTo;
        data.appliesToId = input.appliesTo === 'listing' ? (input.appliesToId ?? null) : null;
      }

      if (input.code !== undefined) {
        const code = normalizeCode(input.code);
        if (code !== existing.code) {
          const clash = await this.promotions.findByCode(tx, code);
          if (clash && clash.id !== id) {
            throw new ConflictException({ statusCode: 409, code: 'PROMO_CODE_TAKEN', message: `Code "${code}" is already in use` });
          }
        }
        data.code = code;
      }

      return this.promotions.update(tx, id, data);
    });
  }
}
