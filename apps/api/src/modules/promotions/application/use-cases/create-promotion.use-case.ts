import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import type { CreatePromotionInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { vnd } from '../../../../shared/money/money';
import {
  PROMOTION_REPOSITORY,
  type CreatePromotionData,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { normalizeCode } from '../apply-promotion.service';
import { assertTenantShareRisk } from '../assert-tenant-share-risk';
import { resolveFundingPartnerId } from '../resolve-funding-partner';

/**
 * Create a promotion (§12.2). Phase 2: any scope, `funded_by = tenant|partner`,
 * per-customer / first-booking limits, off-peak windows, and code-less auto
 * campaigns. A tenant-created partner-funded promo is gated (`partnerOptInAt`
 * null) until the funding partner opts in (§12.2).
 */
@Injectable()
export class CreatePromotionUseCase {
  private readonly logger = new Logger(CreatePromotionUseCase.name);

  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, input: CreatePromotionInput): Promise<PromotionRecord> {
    const code = input.code ? normalizeCode(input.code) : null;
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      if (code) {
        const existing = await this.promotions.findByCode(tx, code);
        if (existing) {
          throw new ConflictException({ statusCode: 409, code: 'PROMO_CODE_TAKEN', message: `Code "${code}" is already in use` });
        }
      }

      // §12.4: block a tenant-funded discount certain to drive the tenant share negative; warn otherwise.
      // (A partner-funded discount comes out of the partner's revenue — the guard no-ops for it.)
      await assertTenantShareRisk(
        tx,
        { fundedBy: input.fundedBy, discountType: input.discountType, discountValue: Number(input.discountValue) },
        this.logger,
      );

      const appliesToId = input.appliesTo === 'all' ? null : (input.appliesToId ?? null);
      // A tenant-created partner-funded promo must resolve a single partner and starts un-opted-in.
      const fundingPartnerId =
        input.fundedBy === 'partner' ? await resolveFundingPartnerId(tx, input.appliesTo, appliesToId) : null;

      const data: CreatePromotionData = {
        name: input.name,
        code,
        discountType: input.discountType,
        discountValue: vnd(input.discountValue),
        maxDiscount: input.maxDiscount !== undefined ? vnd(input.maxDiscount) : null,
        fundedBy: input.fundedBy,
        appliesTo: input.appliesTo,
        appliesToId,
        minOrderAmount: input.minOrderAmount !== undefined ? vnd(input.minOrderAmount) : null,
        firstBookingOnly: input.firstBookingOnly,
        usageLimitTotal: input.usageLimitTotal ?? null,
        usageLimitPerCustomer: input.usageLimitPerCustomer ?? null,
        timeWindows: input.timeWindows ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        status: input.status,
        createdByPartnerId: null,
        fundingPartnerId,
        partnerOptInAt: null,
      };
      return this.promotions.create(tx, tenantId, data);
    });
  }
}
