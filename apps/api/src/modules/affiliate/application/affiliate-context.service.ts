import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  AFFILIATE_REPOSITORY,
  type AffiliateWithUser,
  type IAffiliateRepository,
} from '../domain/ports/affiliate-repository.port';

export interface AffiliateContext {
  affiliateId: string;
  tenantId: string;
}

/**
 * Membership-gated resolution for the affiliate self-service portal (§15.3).
 * Affiliates are NOT an RBAC scope, so `@AuthenticatedOnly` routes never seed a
 * tenant context — this resolves a logged-in user's `affiliates` rows via the
 * BYPASSRLS admin pool (strictly by `userId`), then the caller runs all real work
 * inside `forTenant(context.tenantId)`.
 */
@Injectable()
export class AffiliateContextService {
  constructor(@Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository) {}

  /** Every affiliate membership the user holds, across tenants (for a tenant switcher). */
  async memberships(userId: string): Promise<AffiliateWithUser[]> {
    return this.affiliates.adminFindMembershipsByUser(userId);
  }

  /**
   * The approved membership to act in: the one matching `requestedTenantId`, or —
   * when none is requested — the first approved membership. Throws 403 when the
   * user has no approved affiliate account (pending/suspended included).
   */
  async requireApproved(userId: string, requestedTenantId?: string): Promise<AffiliateContext> {
    const memberships = await this.affiliates.adminFindMembershipsByUser(userId);
    const approved = memberships.filter((m) => m.status === 'approved');
    const chosen = requestedTenantId
      ? approved.find((m) => m.tenantId === requestedTenantId)
      : approved[0];
    if (!chosen) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'NOT_AN_AFFILIATE',
        message: 'No approved affiliate account for this user',
      });
    }
    return { affiliateId: chosen.id, tenantId: chosen.tenantId };
  }

  /**
   * The membership to act in **regardless of status** — for the affiliate's own
   * profile data (payout details). Approval gates earning and link creation, not
   * the ability to correct the bank account you are to be paid into: a `pending`
   * affiliate who mistyped their account number must be able to fix it, and a
   * `suspended` one must not be stuck with stale details. Still 403s for a user
   * with no membership at all, and never widens which rows are reachable — the
   * lookup is filtered to `userId` exactly as `requireApproved` is.
   */
  async requireMembership(userId: string, requestedTenantId?: string): Promise<AffiliateContext> {
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
