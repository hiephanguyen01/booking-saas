import { Inject, Injectable } from '@nestjs/common';
import type { CreatePartnerPromotionInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { vnd } from '../../../../shared/money/money';
import { utcNow } from '../../../../shared/time/time';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { Promotion } from '../../domain/entities/promotion.entity';
import { PromotionCodeTaken } from '../../domain/errors/promotion-errors';
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
          throw new PromotionCodeTaken(code);
        }
      }
      const appliesToId = await assertPartnerOwnsScope(tx, partnerId, input.appliesTo, input.appliesToId ?? null);

      const data = Promotion.openForPartner({
        fields: {
          name: input.name,
          code,
          discountType: input.discountType,
          discountValue: vnd(input.discountValue),
          maxDiscount: input.maxDiscount != null ? vnd(input.maxDiscount) : null,
          minOrderAmount: input.minOrderAmount != null ? vnd(input.minOrderAmount) : null,
          firstBookingOnly: input.firstBookingOnly,
          usageLimitTotal: input.usageLimitTotal ?? null,
          usageLimitPerCustomer: input.usageLimitPerCustomer ?? null,
          timeWindows: input.timeWindows?.length ? input.timeWindows : null,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          status: input.status,
        },
        partnerId,
        appliesTo: input.appliesTo,
        appliesToId,
        now: utcNow(), // the partner created it → already opted in
      });
      return this.promotions.create(tx, tenantId, data);
    });
  }
}
