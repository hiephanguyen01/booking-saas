import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { AffiliateContext } from '../../domain/affiliate-context';
import {
  AFFILIATE_REPOSITORY,
  type IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';

/**
 * The membership to act in **regardless of status** — for the affiliate's own
 * profile data (payout details). Approval gates earning and link creation, not
 * the ability to correct the bank account you are to be paid into: a `pending`
 * affiliate who mistyped their account number must be able to fix it, and a
 * `suspended` one must not be stuck with stale details. Still 403s for a user
 * with no membership at all, and never widens which rows are reachable — the
 * lookup is filtered to `userId` exactly as `RequireApprovedAffiliateUseCase` is.
 */
@Injectable()
export class RequireAffiliateMembershipUseCase {
  constructor(@Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository) {}

  async execute(userId: string, requestedTenantId?: string): Promise<AffiliateContext> {
    const memberships = await this.affiliates.adminFindMembershipsByUser(userId);
    const chosen = requestedTenantId
      ? memberships.find((m) => m.tenantId === requestedTenantId)
      : (memberships.find((m) => m.status === 'approved') ?? memberships[0]);
    if (!chosen) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'NOT_AN_AFFILIATE',
        message: 'No affiliate account for this user',
      });
    }
    return { affiliateId: chosen.id, tenantId: chosen.tenantId };
  }
}
