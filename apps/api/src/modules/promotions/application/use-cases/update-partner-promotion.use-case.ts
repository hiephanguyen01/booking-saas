import { Inject, Injectable } from '@nestjs/common';
import type { UpdatePartnerPromotionInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  PROMOTION_REPOSITORY,
  type IPromotionRepository,
  type PromotionRecord,
} from '../../domain/ports/promotion-repository.port';
import { Promotion } from '../../domain/entities/promotion.entity';
import { PromotionCodeTaken, PromotionNotFound } from '../../domain/errors/promotion-errors';
import { normalizeCode } from '../../domain/promotion-application';
import { assertPartnerOwnsScope } from '../assert-partner-owns-scope';
import { toPromotionUpdateInput } from '../to-promotion-update-input';

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
        throw new PromotionNotFound();
      }
      const promotion = Promotion.rehydrate(existing);
      promotion.assertCreatedBy(partnerId);
      promotion.assertEditable();

      // `null` → clear the condition; absent → leave the stored value untouched. An empty
      // `timeWindows` array is a clear too — the tri-state merge lives in `applyUpdate`.
      const updateInput = toPromotionUpdateInput(input);
      const data = promotion.applyUpdate(updateInput);

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
              throw new PromotionCodeTaken(code);
            }
          }
          data.code = code;
        }
      }

      return this.promotions.update(tx, id, data);
    });
  }
}
