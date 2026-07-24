import { Inject, Injectable } from '@nestjs/common';
import type { UpdateAffiliatePayoutInfoInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { OutboxService } from '../../../../shared/outbox/outbox.service';
import { resolveEffectiveAffiliateRate, type EffectiveAffiliateRate } from '../../domain/affiliate-rate';
import { Affiliate } from '../../domain/entities/affiliate.entity';
import {
  type AffiliateWithUser,
} from '../../domain/ports/affiliate-reader.port';
import {
  AFFILIATE_REPOSITORY,
  type IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';
import {
  COMMISSION_RULE_READER,
  type ICommissionRuleReader,
} from '../../domain/ports/commission-rule-reader.port';

export interface UpdatedAffiliatePayoutInfo {
  affiliate: AffiliateWithUser;
  effectiveRate: EffectiveAffiliateRate;
}

/**
 * An affiliate corrects its own payout (bank) details.
 *
 * Bank details were captured once at signup and never readable or writable again,
 * so a typo'd account number was permanent — and it is the account the tenant pays
 * into. This is that correction path: the affiliate replaces the whole payout
 * object, and (unlike the rest of the portal) may do so at ANY membership status,
 * because fixing the details while still `pending` is precisely when it matters.
 */
@Injectable()
export class UpdateAffiliatePayoutInfoUseCase {
  constructor(
    @Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository,
    @Inject(COMMISSION_RULE_READER) private readonly rules: ICommissionRuleReader,
    private readonly tenantDb: TenantDbService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(
    tenantId: string,
    affiliateId: string,
    input: UpdateAffiliatePayoutInfoInput,
  ): Promise<UpdatedAffiliatePayoutInfo> {
    return this.tenantDb.forTenant(tenantId, async (tx) => {
      const intent = Affiliate.replacePayoutInfo(input);
      const affiliate = await this.affiliates.replacePayoutInfo(
        tx,
        affiliateId,
        intent,
      );
      // Payout details are money-routing data: a change is worth an auditable
      // event, and the event commits in the same tx as the write it describes.
      await this.outbox.emit(tx, {
        tenantId,
        eventType: 'affiliate.payout_updated',
        payload: { affiliateId },
      });
      const rule = await this.rules.findTenantDefault(tx);
      return { affiliate, effectiveRate: resolveEffectiveAffiliateRate(affiliate.customRate, rule) };
    });
  }
}
