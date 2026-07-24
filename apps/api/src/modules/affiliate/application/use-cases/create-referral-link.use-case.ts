import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreateReferralLinkInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ReferralLink } from '../../domain/entities/referral-link.entity';
import { ReferralCodeCollision } from '../../domain/errors/affiliate-errors';
import {
  REFERRAL_LINK_READER,
  type IReferralLinkReader,
  type ReferralLinkRecord,
} from '../../domain/ports/referral-link-reader.port';
import {
  REFERRAL_LINK_REPOSITORY,
  type IReferralLinkRepository,
} from '../../domain/ports/referral-link-repository.port';
import { generateReferralCode } from '../../domain/referral-code';

/** An affiliate mints a referral link (§15.3), retrying on the rare code collision. */
@Injectable()
export class CreateReferralLinkUseCase {
  constructor(
    @Inject(REFERRAL_LINK_REPOSITORY) private readonly links: IReferralLinkRepository,
    @Inject(REFERRAL_LINK_READER) private readonly linkReader: IReferralLinkReader,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    affiliateId: string,
    input: CreateReferralLinkInput,
  ): Promise<ReferralLinkRecord> {
    ReferralLink.prevalidateTarget(input);

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateReferralCode((max) => randomInt(max));
        if (await this.linkReader.findByCode(tx, code)) continue;
        const link = ReferralLink.open({
          tenantId,
          affiliateId,
          code,
          target: input.target,
          listingId: input.listingId,
        });
        return this.links.create(tx, link);
      }
      throw new ReferralCodeCollision();
    });
  }
}
