import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { CreatePartnerPromotionInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { vnd } from '../../../../shared/money/money';
import { utcNow } from '../../../../shared/time/time';
import {
  PROMOTION_REPOSITORY,
  type CreatePromotionData,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { normalizeCode } from '../../domain/promotion-application';
import { assertPartnerOwnsScope } from '../assert-partner-owns-scope';

/**
 * A partner creates its own promotion (§12.2 Phase 2). Always partner-funded and
 * auto-opted-in (the partner willingly bears the cost), scoped to the partner's own
 * inventory. Gated by `PartnerPromotionsEnabledGuard` (the tenant toggle).
 */
@Injectable()
export class CreatePartnerPromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, partnerId: string, input: CreatePartnerPromotionInput): Promise<PromotionRecord> {
    const code = input.code ? normalizeCode(input.code) : null;
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      if (code) {
        const existing = await this.promotions.findByCode(tx, code);
        if (existing) {
          throw new ConflictException({ statusCode: 409, code: 'PROMO_CODE_TAKEN', message: `Code "${code}" is already in use` });
        }
      }
      const appliesToId = await assertPartnerOwnsScope(tx, partnerId, input.appliesTo, input.appliesToId ?? null);

      const data: CreatePromotionData = {
        name: input.name,
        code,
        discountType: input.discountType,
        discountValue: vnd(input.discountValue),
        maxDiscount: input.maxDiscount != null ? vnd(input.maxDiscount) : null,
        fundedBy: 'partner',
        appliesTo: input.appliesTo,
        appliesToId,
        minOrderAmount: input.minOrderAmount != null ? vnd(input.minOrderAmount) : null,
        firstBookingOnly: input.firstBookingOnly,
        usageLimitTotal: input.usageLimitTotal ?? null,
        usageLimitPerCustomer: input.usageLimitPerCustomer ?? null,
        timeWindows: input.timeWindows?.length ? input.timeWindows : null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        status: input.status,
        createdByPartnerId: partnerId,
        fundingPartnerId: partnerId,
        partnerOptInAt: utcNow(), // the partner created it → already opted in
      };
      return this.promotions.create(tx, tenantId, data);
    });
  }
}
