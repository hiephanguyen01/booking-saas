import { Injectable } from '@nestjs/common';
import type { PrismaTx } from '../../../../shared/tenant-context/tenant-db.service';
import type {
  AffiliateAttributionCandidate,
  AttributionUserContact,
  IAffiliateAttributionReader,
} from '../../domain/ports/affiliate-attribution-reader.port';

/**
 * Purpose-built attribution projections. Keeping these separate from the
 * referral-link aggregate avoids relation-heavy reads on the public click path
 * and lets booking reuse its caller-owned tenant transaction.
 */
@Injectable()
export class PrismaAffiliateAttributionReader
  implements IAffiliateAttributionReader
{
  async findApprovedForClick(
    tx: PrismaTx,
    code: string,
  ): Promise<{ linkId: string } | null> {
    const link = await tx.referralLink.findFirst({
      where: { code },
      select: { id: true, affiliate: { select: { status: true } } },
    });
    if (!link || link.affiliate.status !== 'approved') return null;
    return { linkId: link.id };
  }

  async findApprovedCandidate(
    tx: PrismaTx,
    code: string,
  ): Promise<AffiliateAttributionCandidate | null> {
    const link = await tx.referralLink.findFirst({
      where: { code },
      select: {
        code: true,
        affiliate: {
          select: {
            id: true,
            userId: true,
            status: true,
            customRate: true,
          },
        },
      },
    });
    if (!link || link.affiliate.status !== 'approved') return null;
    return {
      affiliateId: link.affiliate.id,
      affiliateUserId: link.affiliate.userId,
      referralCode: link.code,
      customRate: link.affiliate.customRate,
    };
  }

  async findUserContact(
    tx: PrismaTx,
    userId: string,
  ): Promise<AttributionUserContact | null> {
    return tx.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
  }

  async isPartnerMember(
    tx: PrismaTx,
    partnerId: string,
    userId: string,
  ): Promise<boolean> {
    const member = await tx.partnerMember.findFirst({
      where: { partnerId, userId },
      select: { id: true },
    });
    return member !== null;
  }
}
