import { Inject, Injectable } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
import { ReferralLink } from '../../domain/entities/referral-link.entity';
import { ReferralLinkNotFound } from '../../domain/errors/affiliate-errors';
import {
  REFERRAL_LINK_REPOSITORY,
  type IReferralLinkRepository,
} from '../../domain/ports/referral-link-repository.port';

/** Delete one of the affiliate's own referral links (§15.3). */
@Injectable()
export class DeleteReferralLinkUseCase {
  constructor(
    @Inject(REFERRAL_LINK_REPOSITORY) private readonly links: IReferralLinkRepository,
    private readonly tenantDb: TenantDbService,
  ) {}

  async execute(tenantId: string, affiliateId: string, linkId: string): Promise<void> {
    await this.tenantDb.forTenant(tenantId, async (tx) => {
      const state = await this.links.loadById(tx, linkId);
      if (!state) throw new ReferralLinkNotFound();
      ReferralLink.rehydrate(state).assertOwnedBy(affiliateId);
      await this.links.delete(tx, linkId);
    });
  }
}
