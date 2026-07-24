import { Inject, Injectable } from '@nestjs/common';
import type { AffiliateContext } from '../../domain/affiliate-context';
import { ApprovedAffiliateRequired } from '../../domain/errors/affiliate-errors';
import {
  AFFILIATE_READER,
  type IAffiliateReader,
} from '../../domain/ports/affiliate-reader.port';

/**
 * The approved membership to act in: the one matching `requestedTenantId`, or —
 * when none is requested — the first approved membership. Throws 403 when the
 * user has no approved affiliate account (pending/suspended included).
 * See `domain/affiliate-context.ts` for why this runs on the admin pool.
 */
@Injectable()
export class RequireApprovedAffiliateUseCase {
  constructor(
    @Inject(AFFILIATE_READER)
    private readonly affiliates: IAffiliateReader,
  ) {}

  async execute(userId: string, requestedTenantId?: string): Promise<AffiliateContext> {
    const memberships = await this.affiliates.adminFindMembershipsByUser(userId);
    const approved = memberships.filter((m) => m.status === 'approved');
    const chosen = requestedTenantId
      ? approved.find((m) => m.tenantId === requestedTenantId)
      : approved[0];
    if (!chosen) {
      throw new ApprovedAffiliateRequired();
    }
    return { affiliateId: chosen.id, tenantId: chosen.tenantId };
  }
}
