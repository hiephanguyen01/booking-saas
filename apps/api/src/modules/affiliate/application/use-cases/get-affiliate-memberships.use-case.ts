import { Inject, Injectable } from '@nestjs/common';
import {
  AFFILIATE_REPOSITORY,
  type AffiliateWithUser,
  type IAffiliateRepository,
} from '../../domain/ports/affiliate-repository.port';

/**
 * Every affiliate membership the user holds, across tenants (for a tenant
 * switcher). Resolved via the BYPASSRLS admin pool, strictly by `userId` — the
 * portal has no tenant context yet (see `domain/affiliate-context.ts`).
 */
@Injectable()
export class GetAffiliateMembershipsUseCase {
  constructor(@Inject(AFFILIATE_REPOSITORY) private readonly affiliates: IAffiliateRepository) {}

  async execute(userId: string): Promise<AffiliateWithUser[]> {
    return this.affiliates.adminFindMembershipsByUser(userId);
  }
}
