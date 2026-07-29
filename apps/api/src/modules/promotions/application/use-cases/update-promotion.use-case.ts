import { Inject, Injectable, Logger } from '@nestjs/common';
import type { UpdatePromotionInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { PROMO_CONTEXT_LOOKUP, type IPromoContextLookup } from '../../domain/ports/promo-context-lookup.port';
import { Promotion } from '../../domain/entities/promotion.entity';
import { PromotionCodeTaken, PromotionNotFound } from '../../domain/errors/promotion-errors';
import { normalizeCode } from '../../domain/promotion-application';
import { assertScopeTargetValid } from '../assert-scope-target';
import { assertTenantShareRisk } from '../assert-tenant-share-risk';
import { resolveFundingPartnerId } from '../resolve-funding-partner';
import { toPromotionUpdateInput } from '../to-promotion-update-input';

/**
 * Edit a promotion (§12.2). Historic bookings keep their immutable snapshot.
 *
 * Every optional condition distinguishes **absent (leave alone)** from **`null`
 * (clear)** — see the note on `promotionBaseSchema` in `@booking/contracts`. Mapping
 * `null` back to `undefined` here would resurrect the bug where a cap, limit or
 * off-peak window could be set once and never removed.
 */
@Injectable()
export class UpdatePromotionUseCase {
  private readonly logger = new Logger(UpdatePromotionUseCase.name);

  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly promotions: IPromotionRepository,
    @Inject(PROMO_CONTEXT_LOOKUP) private readonly lookup: IPromoContextLookup,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, id: string, input: UpdatePromotionInput): Promise<PromotionRecord> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const existing = await this.promotions.findById(tx, id);
      if (!existing) {
        throw new PromotionNotFound();
      }
      const promotion = Promotion.rehydrate(existing);
      promotion.assertEditable();

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

      // `null` → clear the condition; absent → leave the stored value untouched. An empty
      // `timeWindows` array is a clear too — the tri-state merge lives in `applyUpdate`.
      const updateInput = toPromotionUpdateInput(input);
      const data = promotion.applyUpdate(updateInput);

      // Scope / funding changes re-resolve the funding partner and may reset the opt-in gate (§12.2).
      const scopeTouched = input.fundedBy !== undefined || input.appliesTo !== undefined || input.appliesToId !== undefined;
      const appliesTo = input.appliesTo ?? existing.appliesTo;
      const appliesToId = appliesTo === 'all' ? null : (input.appliesToId ?? existing.appliesToId);
      if (input.appliesTo !== undefined) data.appliesTo = appliesTo;
      if (input.appliesTo !== undefined || input.appliesToId !== undefined) data.appliesToId = appliesToId;
      if (scopeTouched) {
        // The merged (scope, id) pair is what gets stored — validate that, not the input
        // alone: a client may change only `appliesTo` and leave a now-cross-type id behind.
        await assertScopeTargetValid(this.lookup, tx, appliesTo, appliesToId);
        const fundingPartnerId =
          fundedBy === 'partner' ? await resolveFundingPartnerId(tx, appliesTo, appliesToId) : null;
        Object.assign(data, promotion.resolveFundingChange({ fundedBy, fundingPartnerId }));
      }

      if (input.code !== undefined) {
        if (input.code === null) {
          data.code = null; // becomes a code-less auto-campaign
        } else {
          const code = normalizeCode(input.code);
          if (code !== existing.code) {
            const clash = await this.promotions.findByCode(tx, code);
            if (clash && clash.id !== id) {
              throw new PromotionCodeTaken(code);
            }
          }
          data.code = code;
        }
      }

      const resultingCode = input.code === undefined ? existing.code : (data.code ?? null);
      if (resultingCode === null) data.storefrontVisible = false;

      return this.promotions.update(tx, id, data);
    });
  }
}
