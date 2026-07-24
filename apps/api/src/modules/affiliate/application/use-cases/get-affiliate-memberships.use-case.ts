import { Inject, Injectable } from '@nestjs/common';
import {
  AFFILIATE_READER,
  type AffiliateWithUser,
  type IAffiliateReader,
} from '../../domain/ports/affiliate-reader.port';

/**
 * Every affiliate membership the user holds, across tenants (for a tenant
 * switcher). Resolved via the BYPASSRLS admin pool, strictly by `userId` — the
 * portal has no tenant context yet (see `domain/affiliate-context.ts`).
 */
@Injectable()
export class GetAffiliateMembershipsUseCase {
  constructor(
    @Inject(AFFILIATE_READER)
    private readonly affiliates: IAffiliateReader,
  ) {}

  async execute(userId: string): Promise<AffiliateWithUser[]> {
    return this.affiliates.adminFindMembershipsByUser(userId);
  }
}
