import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantDbService } from '../../../../shared/tenant-context/tenant-db.service';
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
      const link = await this.links.findById(tx, linkId);
      if (!link) throw new NotFoundException({ statusCode: 404, code: 'LINK_NOT_FOUND', message: 'Referral link not found' });
      // RLS already scopes to the tenant; this bars deleting another affiliate's link.
      if (link.affiliateId !== affiliateId) {
        throw new ForbiddenException({ statusCode: 403, code: 'NOT_LINK_OWNER', message: 'Not your referral link' });
      }
      await this.links.delete(tx, linkId);
    });
  }
}
