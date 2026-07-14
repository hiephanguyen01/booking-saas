import { randomInt } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { CreateReferralLinkInput } from '@booking/contracts';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import {
  REFERRAL_LINK_REPOSITORY,
  type IReferralLinkRepository,
  type ReferralLinkRecord,
} from '../../domain/ports/referral-link-repository.port';
import { generateReferralCode } from '../../domain/referral-code';

/** An affiliate mints a referral link (§15.3), retrying on the rare code collision. */
@Injectable()
export class CreateReferralLinkUseCase {
  constructor(
    @Inject(REFERRAL_LINK_REPOSITORY) private readonly links: IReferralLinkRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(
    tenantId: string,
    affiliateId: string,
    input: CreateReferralLinkInput,
  ): Promise<ReferralLinkRecord> {
    if (input.target === 'listing' && !input.listingId) {
      throw new BadRequestException({ statusCode: 400, code: 'LISTING_REQUIRED', message: 'listingId is required' });
    }

    return this.tenantDb.forTenant(tenantId, async (tx) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateReferralCode((max) => randomInt(max));
        if (await this.links.findByCode(tx, code)) continue;
        return this.links.create(tx, tenantId, {
          affiliateId,
          code,
          target: input.target,
          listingId: input.target === 'listing' ? (input.listingId ?? null) : null,
        });
      }
      throw new ConflictException({ statusCode: 409, code: 'CODE_COLLISION', message: 'Could not allocate a unique code' });
    });
  }
}
