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
}
