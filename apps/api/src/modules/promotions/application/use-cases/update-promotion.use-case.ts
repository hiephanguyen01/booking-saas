import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { UpdatePromotionInput } from '@booking/contracts';
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
import { resolveFundingPartnerId } from '../resolve-funding-partner';

/** Edit a promotion (§12.2). Historic bookings keep their immutable snapshot. */
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

      const fundedBy = input.fundedBy ?? existing.fundedBy;

      // §12.4: re-check the tenant-share risk against the merged discount details.
      await assertTenantShareRisk(
        tx,
        {
          fundedBy,
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
      if (input.firstBookingOnly !== undefined) data.firstBookingOnly = input.firstBookingOnly;
      if (input.usageLimitTotal !== undefined) data.usageLimitTotal = input.usageLimitTotal;
      if (input.usageLimitPerCustomer !== undefined) data.usageLimitPerCustomer = input.usageLimitPerCustomer;
      if (input.timeWindows !== undefined) data.timeWindows = input.timeWindows ?? null;
      if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt);
      if (input.endsAt !== undefined) data.endsAt = new Date(input.endsAt);
      if (input.status !== undefined) data.status = input.status;

      // Scope / funding changes re-resolve the funding partner and may reset the opt-in gate (§12.2).
      const scopeTouched = input.fundedBy !== undefined || input.appliesTo !== undefined || input.appliesToId !== undefined;
      const appliesTo = input.appliesTo ?? existing.appliesTo;
      const appliesToId = appliesTo === 'all' ? null : (input.appliesToId ?? existing.appliesToId);
      if (input.appliesTo !== undefined) data.appliesTo = appliesTo;
      if (input.appliesTo !== undefined || input.appliesToId !== undefined) data.appliesToId = appliesToId;
      if (scopeTouched) {
        if (fundedBy === 'partner') {
          data.fundedBy = 'partner';
          const fundingPartnerId = await resolveFundingPartnerId(tx, appliesTo, appliesToId);
          data.fundingPartnerId = fundingPartnerId;
          // A different funding partner must opt in again before the promo applies to them.
          if (fundingPartnerId !== existing.fundingPartnerId) data.partnerOptInAt = null;
        } else {
          data.fundedBy = 'tenant';
          data.fundingPartnerId = null;
          data.partnerOptInAt = null;
        }
      }

      if (input.code !== undefined) {
        if (input.code === null) {
          data.code = null; // becomes a code-less auto-campaign
        } else {
          const code = normalizeCode(input.code);
          if (code !== existing.code) {
            const clash = await this.promotions.findByCode(tx, code);
            if (clash && clash.id !== id) {
              throw new ConflictException({ statusCode: 409, code: 'PROMO_CODE_TAKEN', message: `Code "${code}" is already in use` });
            }
          }
          data.code = code;
        }
      }

      return this.promotions.update(tx, id, data);
    });
  }
}
