import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdatePartnerPromotionInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { vnd } from '../../../../shared/money/money';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
  type UpdatePromotionData,
} from '../../domain/ports/promotion-repository.port';
import { normalizeCode } from '../apply-promotion.service';
import { assertPartnerOwnsScope } from '../assert-partner-owns-scope';

/** A partner edits one of its own promotions (§12.2). Scope stays within its inventory. */
@Injectable()
export class UpdatePartnerPromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    partnerId: string,
    id: string,
    input: UpdatePartnerPromotionInput,
  ): Promise<PromotionRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.promotions.findById(tx, id);
      if (!existing) {
        throw new NotFoundException({ statusCode: 404, code: 'PROMO_NOT_FOUND', message: 'Promotion not found' });
      }
      if (existing.createdByPartnerId !== partnerId) {
        throw new ForbiddenException({ statusCode: 403, code: 'PROMO_NOT_OWNED', message: 'Not your promotion' });
      }
      if (existing.status === 'ended') {
        throw new ConflictException({ statusCode: 409, code: 'PROMO_ENDED', message: 'An ended promotion cannot be edited' });
      }

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

      if (input.appliesTo !== undefined || input.appliesToId !== undefined) {
        const appliesTo = input.appliesTo ?? existing.appliesTo;
        const appliesToId = await assertPartnerOwnsScope(
          tx,
          partnerId,
          appliesTo,
          input.appliesToId ?? existing.appliesToId,
        );
        data.appliesTo = appliesTo;
        data.appliesToId = appliesToId;
        data.fundingPartnerId = partnerId; // still the partner's own inventory
      }

      if (input.code !== undefined) {
        if (input.code === null) {
          data.code = null;
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
